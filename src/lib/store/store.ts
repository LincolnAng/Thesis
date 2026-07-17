import {
  initialEntries,
  initialProducts,
  initialRawMaterials,
  initialSocialStats,
  initialSuppliers,
} from "./initial-data";
import {
  assembleProduct,
  assembleSupplier,
  budgetRowsToRecord,
  flattenProductRecipe,
  recordToBudgetRows,
  type BudgetRow,
  type ProductRow,
  type RecipeRow,
  type SupplierPriceHistoryRow,
  type SupplierRow,
} from "./sheet-shapes";
import type {
  AiStatus,
  Entry,
  ExpenseCategory,
  PriceHistoryPoint,
  Product,
  RawMaterialStock,
  SocialStatEntry,
  Supplier,
  SyncStatus,
  TokenUsage,
} from "./types";

export interface StoreState {
  entries: Entry[];
  products: Product[];
  rawMaterials: RawMaterialStock[];
  suppliers: Supplier[];
  socialStats: SocialStatEntry[];
  categoryBudgets: Partial<Record<ExpenseCategory, number>>;
  tokenUsage: TokenUsage;
  aiStatus: AiStatus;
  syncStatus: SyncStatus;
}

const STORAGE_KEY = "mang-kikos-cocoa-state-v6";
const SCHEMA_VERSION = 6;
const ENTRIES_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-entries-migrated-v1";
const PRODUCTS_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-products-migrated-v1";
const RAW_MATERIALS_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-raw-materials-migrated-v1";
const SUPPLIERS_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-suppliers-migrated-v1";
const SOCIAL_STATS_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-social-stats-migrated-v1";
const BUDGETS_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-budgets-migrated-v1";
const SYNC_POLL_INTERVAL_MS = 30_000;

// Different expense categories naturally need different amounts planned for
// them — one flat monthly ceiling couldn't tell you if ingredients were fine
// but transport was blowing its budget.
const DEFAULT_CATEGORY_BUDGETS: Record<ExpenseCategory, number> = {
  raw_materials: 3000,
  labor: 800,
  utilities: 800,
  packaging: 800,
  transport: 600,
  misc: 500,
};

function defaultState(): StoreState {
  return {
    entries: initialEntries,
    products: initialProducts,
    rawMaterials: initialRawMaterials,
    suppliers: initialSuppliers,
    socialStats: initialSocialStats,
    categoryBudgets: { ...DEFAULT_CATEGORY_BUDGETS },
    tokenUsage: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedBudgetTokens: 200_000,
    },
    aiStatus: {
      apiKeyMissing: false,
    },
    syncStatus: {
      failing: false,
      failedAt: null,
    },
  };
}

function loadState(): StoreState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (parsed.__v !== SCHEMA_VERSION) return defaultState();
    // Spread over defaultState() (not just the cached blob) so a field added after
    // a user's browser already cached state under this same SCHEMA_VERSION — like
    // syncStatus — still comes back defined instead of undefined.
    return { ...defaultState(), ...(parsed.state as Partial<StoreState>) };
  } catch {
    return defaultState();
  }
}

function persist(state: StoreState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ __v: SCHEMA_VERSION, state }));
  } catch {
    // storage full or unavailable - fail silently, in-memory state still works
  }
}

const serverSnapshot: StoreState = defaultState();
let state: StoreState = serverSnapshot;
let hydrated = false;
let serverLoadStarted = false;
// Entries added locally before the authoritative Sheets fetch below resolves —
// on that first load, the fetch result overwrites `state.entries` wholesale
// (so a deletion made on another device is correctly reflected here too), but
// anything in this set that isn't yet in the server's response survives the
// overwrite instead of flickering away and reappearing on the next reload.
let pendingLocalEntryIds = new Set<string>();
const listeners = new Set<() => void>();

function ensureHydrated() {
  if (typeof window === "undefined") return;
  if (!hydrated) {
    state = loadState();
    hydrated = true;
  }
  if (!serverLoadStarted) {
    serverLoadStarted = true;
    void loadAllFromServer();
    startSyncPolling();
  }
}

function emit() {
  persist(state);
  listeners.forEach((l) => l());
}

// Every mirror write for a given collection must land in the order it was
// issued — otherwise an update/delete's "find this row" read can race ahead of
// an earlier append that hasn't written yet, causing a duplicate row (update)
// or a silent no-op (delete, which then reappears on the next sync poll).
// Queuing per collection name (i.e. per Sheets tab) serializes writes to that
// tab without blocking unrelated tabs from mirroring concurrently.
const collectionQueues = new Map<string, Promise<void>>();

function enqueueForCollection(collection: string, task: () => Promise<void>): Promise<void> {
  const prior = collectionQueues.get(collection) ?? Promise.resolve();
  const run = prior.then(task, task);
  // Store a tail that always settles, so one failed op doesn't wedge every
  // later op on this collection into permanent rejection.
  collectionQueues.set(
    collection,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function setSyncFailing(failing: boolean) {
  if (state.syncStatus.failing === failing) return;
  setState((prev) => ({
    ...prev,
    syncStatus: { failing, failedAt: failing ? new Date().toISOString() : null },
  }));
}

/** Best-effort helper for every `mirror*` call below — the paint cache still has
 * the change locally for this device even if the write to Sheets fails, but a
 * failure now flips visible sync-status (see `SyncErrorBanner`) instead of
 * disappearing silently. Ops on the same collection are serialized (see
 * `enqueueForCollection`) so a fast add-then-edit/delete can't race. */
async function mirrorOp(
  collection: string,
  op: "append" | "update" | "delete" | "migrate",
  payload: { id?: string; item?: unknown; items?: unknown[] },
): Promise<void> {
  await enqueueForCollection(collection, async () => {
    try {
      const res = await fetch("/api/business-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection, op, ...payload }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.reason ?? json.detail ?? "sync failed");
      setSyncFailing(false);
    } catch {
      setSyncFailing(true);
    }
  });
}

/** Pushes whatever's currently local up to Sheets exactly once, the first time the
 * sheet comes back empty for that collection — shared by every collection below so
 * the migration logic (and its "don't re-run, don't double-import" flag) isn't
 * duplicated five times. */
async function migrateCollectionIfEmpty<T>(
  collectionName: string,
  flagKey: string,
  serverItems: T[],
  localItems: T[],
): Promise<{ items: T[]; migrated: boolean }> {
  if (serverItems.length > 0 || window.localStorage.getItem(flagKey)) {
    return { items: serverItems, migrated: false };
  }
  if (localItems.length === 0) {
    window.localStorage.setItem(flagKey, "true");
    return { items: serverItems, migrated: false };
  }
  try {
    const res = await fetch("/api/business-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: collectionName, op: "migrate", items: localItems }),
    });
    const json = await res.json();
    if (json.success) {
      window.localStorage.setItem(flagKey, "true");
      return { items: localItems, migrated: true };
    }
  } catch {
    // leave the flag unset — retried on the next load
  }
  return { items: serverItems, migrated: false };
}

async function migrateChildRows(collectionName: string, items: unknown[]): Promise<void> {
  if (items.length === 0) return;
  await mirrorOp(collectionName, "migrate", { items });
}

function priceHistoryToRows(supplierId: string, history: PriceHistoryPoint[]): SupplierPriceHistoryRow[] {
  return history.map((h, i) => ({ id: genId(`price-${supplierId}-${i}`), supplierId, date: h.date, price: h.price }));
}

/**
 * Google Sheets is the source of truth for every business collection now —
 * entries, products+recipes, raw materials, suppliers+price history, social
 * stats, and budgets. Local storage remains a disposable paint cache for
 * instant load, same pattern as chat history. This always-overwrite fetch also
 * doubles as the two-way sync poll (`startSyncPolling` below): edits made
 * directly in Sheets, or from another device, show up here on the next call.
 *
 * Deletion is deliberately one-way (app → Sheets): a row missing from the
 * server response is never treated as "delete it locally" — only the
 * app's own delete/reset mutators remove data. That's what makes it safe to
 * reorganize or prune the spreadsheet for looks without risking real data.
 */
async function loadAllFromServer() {
  try {
    const res = await fetch("/api/business-data");
    const json = await res.json();
    if (!json.success) return; // Sheets unreachable — keep local/paint-cache state

    const entriesMigration = await migrateCollectionIfEmpty<Entry>(
      "entries",
      ENTRIES_MIGRATION_FLAG_KEY,
      Array.isArray(json.entries) ? json.entries : [],
      state.entries.filter((e) => !e.id.startsWith("seed-")),
    );

    const productsMigration = await migrateCollectionIfEmpty<ProductRow>(
      "products",
      PRODUCTS_MIGRATION_FLAG_KEY,
      Array.isArray(json.products) ? json.products : [],
      state.products.map(toProductRow),
    );
    let recipeRows: RecipeRow[] = Array.isArray(json.recipes) ? json.recipes : [];
    if (productsMigration.migrated) {
      recipeRows = state.products.flatMap(flattenProductRecipe);
      await migrateChildRows("recipes", recipeRows);
    }

    const rawMaterialsMigration = await migrateCollectionIfEmpty<RawMaterialStock>(
      "rawMaterials",
      RAW_MATERIALS_MIGRATION_FLAG_KEY,
      Array.isArray(json.rawMaterials) ? json.rawMaterials : [],
      state.rawMaterials,
    );

    const suppliersMigration = await migrateCollectionIfEmpty<SupplierRow>(
      "suppliers",
      SUPPLIERS_MIGRATION_FLAG_KEY,
      Array.isArray(json.suppliers) ? json.suppliers : [],
      state.suppliers.map(toSupplierRow),
    );
    let historyRows: SupplierPriceHistoryRow[] = Array.isArray(json.supplierPriceHistory) ? json.supplierPriceHistory : [];
    if (suppliersMigration.migrated) {
      historyRows = state.suppliers.flatMap((s) => priceHistoryToRows(s.id, s.priceHistory));
      await migrateChildRows("supplierPriceHistory", historyRows);
    }

    const socialStatsMigration = await migrateCollectionIfEmpty<SocialStatEntry>(
      "socialStats",
      SOCIAL_STATS_MIGRATION_FLAG_KEY,
      Array.isArray(json.socialStats) ? json.socialStats : [],
      state.socialStats,
    );

    const budgetsMigration = await migrateCollectionIfEmpty<BudgetRow>(
      "budgets",
      BUDGETS_MIGRATION_FLAG_KEY,
      Array.isArray(json.budgets) ? json.budgets : [],
      recordToBudgetRows(state.categoryBudgets),
    );

    const serverEntries = entriesMigration.items;
    const serverIds = new Set(serverEntries.map((e) => e.id));

    setState((prev) => {
      const stillPendingLocal = prev.entries.filter((e) => pendingLocalEntryIds.has(e.id) && !serverIds.has(e.id));
      pendingLocalEntryIds = new Set(stillPendingLocal.map((e) => e.id));
      const mergedEntries = [...stillPendingLocal, ...serverEntries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return {
        ...prev,
        entries: mergedEntries,
        products: productsMigration.items.map((row) => assembleProduct(row, recipeRows)),
        rawMaterials: rawMaterialsMigration.items,
        suppliers: suppliersMigration.items.map((row) => assembleSupplier(row, historyRows)),
        socialStats: socialStatsMigration.items,
        categoryBudgets: budgetRowsToRecord(budgetsMigration.items),
      };
    });
  } catch {
    // network/parse error — keep local/paint-cache state
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Two-way sync: re-runs the same authoritative fetch on a timer so edits made
 * directly in Sheets (or from another device) show up here without a page reload.
 * Paused while the tab isn't visible, both to save quota and because a poll can't
 * usefully update a page nobody's looking at. */
function startSyncPolling() {
  if (typeof window === "undefined" || pollTimer) return;

  function tick() {
    if (document.visibilityState === "visible") void loadAllFromServer();
  }

  pollTimer = setInterval(tick, SYNC_POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", tick);
}

async function mirrorEntryAppend(entry: Entry) {
  await mirrorOp("entries", "append", { item: entry });
}

async function mirrorEntryUpdate(id: string, entry: Entry) {
  await mirrorOp("entries", "update", { id, item: entry });
}

async function mirrorEntryDelete(id: string) {
  await mirrorOp("entries", "delete", { id });
}

export function subscribe(listener: () => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): StoreState {
  ensureHydrated();
  return state;
}

export function getServerSnapshot(): StoreState {
  return serverSnapshot;
}

function setState(updater: (prev: StoreState) => StoreState) {
  ensureHydrated();
  state = updater(state);
  emit();
}

function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

function findProductBySku(products: Product[], sku: string | null): Product | undefined {
  if (!sku) return undefined;
  const n = normalize(sku);
  return (
    products.find((p) => normalize(p.name) === n) ??
    products.find((p) => normalize(p.name).includes(n) || n.includes(normalize(p.name)))
  );
}

function findRawMaterialByName(materials: RawMaterialStock[], name: string | null): RawMaterialStock | undefined {
  if (!name) return undefined;
  const n = normalize(name);
  return (
    materials.find((m) => normalize(m.name) === n) ??
    materials.find((m) => normalize(m.name).includes(n) || n.includes(normalize(m.name)))
  );
}

// --- Entries -----------------------------------------------------------
//
// Every entry can affect product stock and/or raw-material stock. To support
// Undo and Edit in the chat UI, side effects are applied via a signed
// direction (+1 to log, -1 to reverse) so they can be cleanly undone.

function applyEntrySideEffects(
  entry: Entry,
  direction: 1 | -1,
  products: Product[],
  rawMaterials: RawMaterialStock[],
): { products: Product[]; rawMaterials: RawMaterialStock[] } {
  if (!entry.quantity) return { products, rawMaterials };
  const delta = entry.quantity * direction;

  if (entry.type === "SALE" || entry.type === "INVENTORY_OUT" || entry.type === "WASTE") {
    const product = findProductBySku(products, entry.sku);
    if (product) {
      products = products.map((p) => (p.id === product.id ? { ...p, stockQty: Math.max(0, p.stockQty - delta) } : p));
    }
  } else if (entry.type === "INVENTORY_IN") {
    const product = findProductBySku(products, entry.sku);
    if (product) {
      products = products.map((p) => (p.id === product.id ? { ...p, stockQty: Math.max(0, p.stockQty + delta) } : p));
    }
  } else if (entry.type === "EXPENSE" && (entry.category === "raw_materials" || entry.category === "packaging")) {
    const material = findRawMaterialByName(rawMaterials, entry.sku);
    if (material) {
      rawMaterials = rawMaterials.map((m) => (m.id === material.id ? { ...m, qty: Math.max(0, m.qty + delta) } : m));
    }
  }

  return { products, rawMaterials };
}

export function addEntry(input: Omit<Entry, "id"> & { id?: string }): Entry {
  const entry: Entry = { ...input, id: input.id ?? genId("entry") };
  pendingLocalEntryIds.add(entry.id);
  setState((prev) => {
    const { products, rawMaterials } = applyEntrySideEffects(entry, 1, prev.products, prev.rawMaterials);
    return { ...prev, entries: [entry, ...prev.entries], products, rawMaterials };
  });
  void mirrorEntryAppend(entry);
  return entry;
}

/** Removes an entry and reverses whatever stock/ingredient effects it applied. Used by Undo. */
export function deleteEntry(id: string) {
  if (!state.entries.some((e) => e.id === id)) return;
  pendingLocalEntryIds.delete(id);
  setState((prev) => {
    const entry = prev.entries.find((e) => e.id === id);
    if (!entry) return prev;
    const { products, rawMaterials } = applyEntrySideEffects(entry, -1, prev.products, prev.rawMaterials);
    return { ...prev, entries: prev.entries.filter((e) => e.id !== id), products, rawMaterials };
  });
  void mirrorEntryDelete(id);
}

/** Replaces an entry's fields, reversing the old side effects and applying the new ones. Used by Edit. */
export function replaceEntry(id: string, next: Omit<Entry, "id">) {
  let updatedEntry: Entry | null = null;
  setState((prev) => {
    const old = prev.entries.find((e) => e.id === id);
    if (!old) return prev;
    const reversed = applyEntrySideEffects(old, -1, prev.products, prev.rawMaterials);
    updatedEntry = { ...next, id };
    const applied = applyEntrySideEffects(updatedEntry, 1, reversed.products, reversed.rawMaterials);
    return {
      ...prev,
      entries: prev.entries.map((e) => (e.id === id ? (updatedEntry as Entry) : e)),
      products: applied.products,
      rawMaterials: applied.rawMaterials,
    };
  });
  if (updatedEntry) void mirrorEntryUpdate(id, updatedEntry);
}

// --- Products ------------------------------------------------------------

function toProductRow(p: Product): ProductRow {
  return {
    id: p.id,
    name: p.name,
    standardPrice: p.standardPrice,
    pricingMode: p.pricingMode,
    marginPercent: p.marginPercent,
    friendPrice: p.friendPrice,
    wholesalePrice: p.wholesalePrice,
    stockQty: p.stockQty,
    lowStockThreshold: p.lowStockThreshold,
    batchYield: p.batchYield,
  };
}

/** Diffs one product's recipe rows before/after an edit and mirrors just the
 * change — rows no longer present are soft-deleted, everything else is
 * upserted (Sheets' `update` already appends when a row doesn't exist yet). */
function mirrorProductRecipeDiff(oldProduct: Product, newProduct: Product) {
  const oldRows = flattenProductRecipe(oldProduct);
  const newRows = flattenProductRecipe(newProduct);
  const newIds = new Set(newRows.map((r) => r.id));
  for (const row of oldRows) {
    if (!newIds.has(row.id)) void mirrorOp("recipes", "delete", { id: row.id });
  }
  for (const row of newRows) {
    void mirrorOp("recipes", "update", { id: row.id, item: row });
  }
}

export function updateProduct(id: string, patch: Partial<Product>) {
  let oldProduct: Product | undefined;
  let newProduct: Product | undefined;
  setState((prev) => ({
    ...prev,
    products: prev.products.map((p) => {
      if (p.id !== id) return p;
      oldProduct = p;
      newProduct = { ...p, ...patch };
      return newProduct;
    }),
  }));
  if (!oldProduct || !newProduct) return;
  void mirrorOp("products", "update", { id, item: toProductRow(newProduct) });
  if (patch.recipeIngredients || patch.recipeLabor || patch.recipeMisc) {
    mirrorProductRecipeDiff(oldProduct, newProduct);
  }
}

export function addProduct(input: Omit<Product, "id">): Product {
  const product: Product = { ...input, id: genId("prod") };
  setState((prev) => ({ ...prev, products: [...prev.products, product] }));
  void mirrorOp("products", "append", { item: toProductRow(product) });
  void migrateChildRows("recipes", flattenProductRecipe(product));
  return product;
}

// --- Raw materials ---------------------------------------------------------

export function updateRawMaterial(id: string, patch: Partial<RawMaterialStock>) {
  let updated: RawMaterialStock | undefined;
  setState((prev) => ({
    ...prev,
    rawMaterials: prev.rawMaterials.map((m) => {
      if (m.id !== id) return m;
      updated = { ...m, ...patch };
      return updated;
    }),
  }));
  if (updated) void mirrorOp("rawMaterials", "update", { id, item: updated });
}

export function addRawMaterial(input: Omit<RawMaterialStock, "id">): RawMaterialStock {
  const material: RawMaterialStock = { ...input, id: genId("rm") };
  setState((prev) => ({ ...prev, rawMaterials: [...prev.rawMaterials, material] }));
  void mirrorOp("rawMaterials", "append", { item: material });
  return material;
}

// --- Suppliers -------------------------------------------------------------

function toSupplierRow(s: Supplier): SupplierRow {
  return { id: s.id, name: s.name, type: s.type, items: s.items, lastPrice: s.lastPrice, contact: s.contact };
}

export function updateSupplier(id: string, patch: Partial<Supplier>) {
  let updated: Supplier | undefined;
  let newHistoryPoint: PriceHistoryPoint | null = null;
  setState((prev) => ({
    ...prev,
    suppliers: prev.suppliers.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s, ...patch };
      if (patch.lastPrice !== undefined && patch.lastPrice !== s.lastPrice) {
        const point = { date: new Date().toISOString(), price: patch.lastPrice };
        next.priceHistory = [...s.priceHistory, point];
        newHistoryPoint = point;
      }
      updated = next;
      return next;
    }),
  }));
  if (updated) void mirrorOp("suppliers", "update", { id, item: toSupplierRow(updated) });
  if (newHistoryPoint) {
    const point: PriceHistoryPoint = newHistoryPoint;
    void mirrorOp("supplierPriceHistory", "append", {
      item: { id: genId(`price-${id}`), supplierId: id, date: point.date, price: point.price },
    });
  }
}

export function addSupplier(input: Omit<Supplier, "id" | "priceHistory">): Supplier {
  const historyPoint = { date: new Date().toISOString(), price: input.lastPrice };
  const supplier: Supplier = { ...input, id: genId("sup"), priceHistory: [historyPoint] };
  setState((prev) => ({ ...prev, suppliers: [...prev.suppliers, supplier] }));
  void mirrorOp("suppliers", "append", { item: toSupplierRow(supplier) });
  void mirrorOp("supplierPriceHistory", "append", {
    item: { id: genId(`price-${supplier.id}`), supplierId: supplier.id, date: historyPoint.date, price: historyPoint.price },
  });
  return supplier;
}

// --- Social stats --------------------------------------------------------

export function addSocialStat(input: Omit<SocialStatEntry, "id">): SocialStatEntry {
  const stat: SocialStatEntry = { ...input, id: genId("soc") };
  setState((prev) => ({ ...prev, socialStats: [...prev.socialStats, stat] }));
  void mirrorOp("socialStats", "append", { item: stat });
  return stat;
}

// --- Token usage ------------------------------------------------------------

export function addTokenUsage(inputTokens: number, outputTokens: number) {
  setState((prev) => ({
    ...prev,
    tokenUsage: {
      ...prev.tokenUsage,
      totalInputTokens: prev.tokenUsage.totalInputTokens + inputTokens,
      totalOutputTokens: prev.tokenUsage.totalOutputTokens + outputTokens,
    },
  }));
}

export function setApiKeyMissing(missing: boolean) {
  setState((prev) => ({ ...prev, aiStatus: { ...prev.aiStatus, apiKeyMissing: missing } }));
}

// --- Budget --------------------------------------------------------------

export function setCategoryBudget(category: ExpenseCategory, amount: number) {
  const clamped = Math.max(0, amount);
  setState((prev) => ({
    ...prev,
    categoryBudgets: { ...prev.categoryBudgets, [category]: clamped },
  }));
  void mirrorOp("budgets", "update", { id: category, item: { category, monthlyBudget: clamped } });
}

export function removeCategoryBudget(category: ExpenseCategory) {
  setState((prev) => {
    const next = { ...prev.categoryBudgets };
    delete next[category];
    return { ...prev, categoryBudgets: next };
  });
  void mirrorOp("budgets", "delete", { id: category });
}

export function resetAllData() {
  setState(() => defaultState());
}

/** Restores the catalog collections from a previously exported backup file, and
 * pushes them up to Sheets too — these are Sheets-authoritative now (like
 * entries), so without this the next sync poll would just overwrite the
 * restored values straight back with whatever Sheets still has. */
export function restoreLocalCollections(data: {
  products?: Product[];
  rawMaterials?: RawMaterialStock[];
  suppliers?: Supplier[];
  socialStats?: SocialStatEntry[];
  categoryBudgets?: Partial<Record<ExpenseCategory, number>>;
}) {
  setState((prev) => ({
    ...prev,
    products: data.products ?? prev.products,
    rawMaterials: data.rawMaterials ?? prev.rawMaterials,
    suppliers: data.suppliers ?? prev.suppliers,
    socialStats: data.socialStats ?? prev.socialStats,
    categoryBudgets: data.categoryBudgets ?? prev.categoryBudgets,
  }));

  data.products?.forEach((p) => {
    void mirrorOp("products", "update", { id: p.id, item: toProductRow(p) });
    void migrateChildRows("recipes", flattenProductRecipe(p));
  });
  data.rawMaterials?.forEach((m) => void mirrorOp("rawMaterials", "update", { id: m.id, item: m }));
  data.suppliers?.forEach((s) => {
    void mirrorOp("suppliers", "update", { id: s.id, item: toSupplierRow(s) });
    void migrateChildRows("supplierPriceHistory", priceHistoryToRows(s.id, s.priceHistory));
  });
  data.socialStats?.forEach((stat) => void mirrorOp("socialStats", "update", { id: stat.id, item: stat }));
  if (data.categoryBudgets) {
    for (const [category, amount] of Object.entries(data.categoryBudgets)) {
      void mirrorOp("budgets", "update", { id: category, item: { category, monthlyBudget: amount } });
    }
  }
}
