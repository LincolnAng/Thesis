import {
  initialEntries,
  initialProducts,
  initialRawMaterials,
  initialSocialStats,
  initialSuppliers,
} from "./initial-data";
import type {
  AiStatus,
  Entry,
  ExpenseCategory,
  Product,
  RawMaterialStock,
  SocialStatEntry,
  Supplier,
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
}

const STORAGE_KEY = "mang-kikos-cocoa-state-v6";
const SCHEMA_VERSION = 6;
const ENTRIES_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-entries-migrated-v1";

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
  };
}

function loadState(): StoreState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (parsed.__v !== SCHEMA_VERSION) return defaultState();
    return parsed.state as StoreState;
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
let entriesLoadStarted = false;
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
  if (!entriesLoadStarted) {
    entriesLoadStarted = true;
    void loadEntriesFromServer();
  }
}

function emit() {
  persist(state);
  listeners.forEach((l) => l());
}

/**
 * Google Sheets is the source of truth for entries (business data is migrating
 * off localStorage collection by collection — entries first). Local storage
 * still acts as a disposable paint cache (via `persist`/`loadState` above) for
 * instant load, same as chat history's pattern.
 */
async function loadEntriesFromServer() {
  try {
    const res = await fetch("/api/business-data");
    const json = await res.json();
    if (!json.success || !Array.isArray(json.entries)) return; // Sheets unreachable — keep local/paint-cache state

    let serverEntries: Entry[] = json.entries;

    if (serverEntries.length === 0 && !window.localStorage.getItem(ENTRIES_MIGRATION_FLAG_KEY)) {
      // First run against a fresh sheet — push up any real local history once,
      // skipping the demo seed data every fresh install starts with.
      const localEntries = state.entries.filter((e) => !e.id.startsWith("seed-"));
      if (localEntries.length > 0) {
        try {
          const migrateRes = await fetch("/api/business-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ collection: "entries", op: "migrate", items: localEntries }),
          });
          const migrateJson = await migrateRes.json();
          if (migrateJson.success) {
            serverEntries = localEntries;
            window.localStorage.setItem(ENTRIES_MIGRATION_FLAG_KEY, "true");
          }
        } catch {
          // leave the flag unset — retried on the next load
        }
      } else {
        window.localStorage.setItem(ENTRIES_MIGRATION_FLAG_KEY, "true");
      }
    }

    const serverIds = new Set(serverEntries.map((e) => e.id));
    setState((prev) => {
      const stillPendingLocal = prev.entries.filter((e) => pendingLocalEntryIds.has(e.id) && !serverIds.has(e.id));
      pendingLocalEntryIds = new Set(stillPendingLocal.map((e) => e.id));
      const merged = [...stillPendingLocal, ...serverEntries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      return { ...prev, entries: merged };
    });
  } catch {
    // network/parse error — keep local/paint-cache state
  }
}

async function mirrorEntryAppend(entry: Entry) {
  try {
    await fetch("/api/business-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "entries", op: "append", item: entry }),
    });
  } catch {
    // best-effort — the paint cache still has it locally for this device
  }
}

async function mirrorEntryUpdate(id: string, entry: Entry) {
  try {
    await fetch("/api/business-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "entries", op: "update", id, item: entry }),
    });
  } catch {
    // best-effort
  }
}

async function mirrorEntryDelete(id: string) {
  try {
    await fetch("/api/business-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "entries", op: "delete", id }),
    });
  } catch {
    // best-effort
  }
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

export function updateProduct(id: string, patch: Partial<Product>) {
  setState((prev) => ({
    ...prev,
    products: prev.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }));
}

export function addProduct(input: Omit<Product, "id">): Product {
  const product: Product = { ...input, id: genId("prod") };
  setState((prev) => ({ ...prev, products: [...prev.products, product] }));
  return product;
}

// --- Raw materials ---------------------------------------------------------

export function updateRawMaterial(id: string, patch: Partial<RawMaterialStock>) {
  setState((prev) => ({
    ...prev,
    rawMaterials: prev.rawMaterials.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  }));
}

export function addRawMaterial(input: Omit<RawMaterialStock, "id">): RawMaterialStock {
  const material: RawMaterialStock = { ...input, id: genId("rm") };
  setState((prev) => ({ ...prev, rawMaterials: [...prev.rawMaterials, material] }));
  return material;
}

// --- Suppliers -------------------------------------------------------------

export function updateSupplier(id: string, patch: Partial<Supplier>) {
  setState((prev) => ({
    ...prev,
    suppliers: prev.suppliers.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s, ...patch };
      if (patch.lastPrice !== undefined && patch.lastPrice !== s.lastPrice) {
        next.priceHistory = [...s.priceHistory, { date: new Date().toISOString(), price: patch.lastPrice }];
      }
      return next;
    }),
  }));
}

export function addSupplier(input: Omit<Supplier, "id" | "priceHistory">): Supplier {
  const supplier: Supplier = {
    ...input,
    id: genId("sup"),
    priceHistory: [{ date: new Date().toISOString(), price: input.lastPrice }],
  };
  setState((prev) => ({ ...prev, suppliers: [...prev.suppliers, supplier] }));
  return supplier;
}

// --- Social stats --------------------------------------------------------

export function addSocialStat(input: Omit<SocialStatEntry, "id">): SocialStatEntry {
  const stat: SocialStatEntry = { ...input, id: genId("soc") };
  setState((prev) => ({ ...prev, socialStats: [...prev.socialStats, stat] }));
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
  setState((prev) => ({
    ...prev,
    categoryBudgets: { ...prev.categoryBudgets, [category]: Math.max(0, amount) },
  }));
}

export function removeCategoryBudget(category: ExpenseCategory) {
  setState((prev) => {
    const next = { ...prev.categoryBudgets };
    delete next[category];
    return { ...prev, categoryBudgets: next };
  });
}

export function resetAllData() {
  setState(() => defaultState());
}
