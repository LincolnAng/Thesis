import {
  initialEntries,
  initialProducts,
  initialRawMaterials,
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
import { findProduct } from "@/lib/summary/product-match";
import { rawQuantityNeeded } from "@/lib/summary/cacao";
import { ENTRY_TYPE_LABELS, formatPeso } from "@/lib/format";
import { isMaterialWaste } from "@/lib/transactions/waste";
import { currentUser, signOut } from "@/lib/auth/current-user";
import type { BusinessSettingRow } from "@/lib/sheets/business-settings";
import type {
  AiStatus,
  BusinessEvent,
  EventStockMovement,
  Entry,
  ExpenseCategory,
  PriceHistoryPoint,
  Product,
  RawMaterialStock,
  Supplier,
  SyncStatus,
  TokenUsage,
  Machine,
  SupplierPrice,
  AppUser,
  Role,
  ActivityEvent,
  StaffMember,
  TimeRecord,
  PayrollRecord,
  CalendarItem,
  StockTransfer,
} from "./types";

export interface StoreState {
  entries: Entry[];
  products: Product[];
  rawMaterials: RawMaterialStock[];
  suppliers: Supplier[];
  categoryBudgets: Partial<Record<ExpenseCategory, number>>;
  events: BusinessEvent[];
  eventStock: EventStockMovement[];
  machines: Machine[];
  supplierPrices: SupplierPrice[];
  /** Everyone who uses this app on the shared device, and what they've changed. */
  users: AppUser[];
  activity: ActivityEvent[];
  /** Salaries (executives); an employee's copy has names only and no payroll. */
  staff: StaffMember[];
  timeRecords: TimeRecord[];
  payroll: PayrollRecord[];
  /** What the signed-in person has on their calendar, and what was shared with them. */
  calendarItems: CalendarItem[];
  /** Stock moved between branches. */
  stockTransfers: StockTransfer[];
  /** Business-level numbers the owner sets once — hourly labor rate today. */
  businessSettings: Record<string, string>;
  tokenUsage: TokenUsage;
  aiStatus: AiStatus;
  syncStatus: SyncStatus;
  /** True once this page has the server's data, not just the paint cache or the built-in
   *  samples. Anything that changes data based on what is (or isn't) there waits for it. */
  loadedFromServer: boolean;
}

const STORAGE_KEY = "mang-kikos-cocoa-state-v6";
const SCHEMA_VERSION = 6;
const ENTRIES_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-entries-migrated-v1";
const PRODUCTS_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-products-migrated-v1";
const RAW_MATERIALS_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-raw-materials-migrated-v1";
const SUPPLIERS_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-suppliers-migrated-v1";
const BUDGETS_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-budgets-migrated-v1";
const EVENTS_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-events-migrated-v1";
const MACHINES_MIGRATION_FLAG_KEY = "mangkiko.migrated.machines";
const SUPPLIER_PRICES_MIGRATION_FLAG_KEY = "mangkiko.migrated.supplierPrices";
const BUSINESS_SETTINGS_MIGRATION_FLAG_KEY = "mangkiko.migrated.businessSettings";
const EVENT_STOCK_MIGRATION_FLAG_KEY = "mang-kikos-cocoa-event-stock-migrated-v1";
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
    categoryBudgets: { ...DEFAULT_CATEGORY_BUDGETS },
    events: [],
    eventStock: [],
    machines: [],
    supplierPrices: [],
    users: [],
    activity: [],
    staff: [],
    timeRecords: [],
    payroll: [],
    calendarItems: [],
    stockTransfers: [],
    businessSettings: {},
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
    loadedFromServer: false,
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
    return { ...defaultState(), ...(parsed.state as Partial<StoreState>), loadedFromServer: false };
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
  // Nothing to load until someone has signed in: the server answers per profile, and an
  // unsigned request is refused.
  if (!serverLoadStarted && currentUser()) {
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
/** Saves still on their way to Sheets. While any are, the sync poll holds off — otherwise it
 * would reload the sheet's older copy over a change that simply hasn't landed yet. */
let pendingWrites = 0;

/** Waits before each retry of a save that failed (usually Sheets being briefly over quota). */
const SAVE_RETRY_DELAYS_MS = [3_000, 10_000, 30_000];

async function mirrorOp(
  collection: string,
  op: "append" | "update" | "delete" | "migrate",
  payload: { id?: string; item?: unknown; items?: unknown[]; before?: unknown },
  /** Set for writes that are a consequence of another write (stock moving because a sale
   * was logged), so the log shows the thing the person did and not its bookkeeping. */
  silent = false,
): Promise<boolean> {
  if (!silent) recordActivity(collection, op, payload);
  pendingWrites += 1;
  // True only once the server has said the write landed. Callers that tell the owner "saved"
  // wait for this; everything else carries on as before.
  let confirmed = false;
  try {
    await enqueueForCollection(collection, async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await fetch("/api/business-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ collection, op, ...payload }),
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.reason ?? json.detail ?? "sync failed");
          setSyncFailing(false);
          confirmed = true;
          return;
        } catch {
          // A 400 (bad request) won't succeed on retry, but those are programming errors;
          // quota and network failures are the common case and do recover.
          if (attempt >= SAVE_RETRY_DELAYS_MS.length) {
            setSyncFailing(true);
            return;
          }
          await new Promise((r) => setTimeout(r, SAVE_RETRY_DELAYS_MS[attempt]));
        }
      }
    });
  } finally {
    pendingWrites -= 1;
  }
  return confirmed;
}

// --- Who changed what -------------------------------------------------------------------

const COLLECTION_NOUNS: Record<string, string> = {
  entries: "transaction",
  products: "product",
  recipes: "recipe",
  rawMaterials: "ingredient",
  suppliers: "supplier",
  supplierPrices: "supplier price",
  supplierPriceHistory: "supplier price",
  budgets: "budget",
  events: "event",
  eventStock: "event stock",
  machines: "equipment",
  businessSettings: "setting",
  users: "person",
  staff: "staff member",
  timeRecords: "time record",
  payroll: "salary payment",
  calendarItems: "calendar item",
  stockTransfers: "stock transfer",
};

const OP_VERBS: Record<string, string> = { append: "added", update: "changed", delete: "deleted" };

/** The bit after the dash: enough to recognize the row without opening it. */
function describeItem(collection: string, item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const row = item as Record<string, unknown>;
  if (collection === "entries") {
    // "Sale · Classic" told her a sale happened and nothing she could check it against, so a
    // row in the log could match half a dozen real transactions. Quantity, who, and when make
    // it a specific event she can recognise.
    const type = typeof row.type === "string" ? ENTRY_TYPE_LABELS[row.type] ?? row.type : "";
    const qty = typeof row.quantity === "number" && row.quantity ? `${row.quantity}${row.unit ? ` ${row.unit}` : ""}` : "";
    const sku = typeof row.sku === "string" && row.sku ? row.sku : "";
    const thing = [qty, sku].filter(Boolean).join(" ");
    const who = typeof row.counterparty === "string" && row.counterparty ? row.counterparty : "";
    const amount = typeof row.amount === "number" && row.amount ? formatPeso(row.amount) : "";
    const when =
      typeof row.timestamp === "string" && row.timestamp
        ? new Date(row.timestamp).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
        : "";
    return [type, thing, who && `${row.type === "EXPENSE" ? "to" : "for"} ${who}`, amount, when]
      .filter(Boolean)
      .join(" · ");
  }
  if (collection === "businessSettings") return typeof row.key === "string" ? row.key : "";
  const named = [row.name, row.label, row.key].find((v) => typeof v === "string" && v);
  return typeof named === "string" ? named : "";
}

function recordActivity(
  collection: string,
  op: string,
  payload: { id?: string; item?: unknown; before?: unknown },
) {
  // The log's own rows, and the one-off import of existing data, aren't anybody's edit.
  if (collection === "activity" || op === "migrate") return;
  const verb = OP_VERBS[op];
  const noun = COLLECTION_NOUNS[collection];
  if (!verb || !noun) return;
  const who = currentUser();
  // A delete carries no new row — the thing is gone. Describing what was there is the only
  // way the log can say WHICH transaction was removed; "deleted a transaction" on its own is
  // a line she has to guess at.
  const detail = describeItem(collection, payload.item ?? payload.before);
  const item = payload.item as { id?: string } | undefined;
  const event: ActivityEvent = {
    id: genId("act"),
    at: new Date().toISOString(),
    userId: who?.id ?? "",
    userName: who?.name ?? "Someone",
    action: `${verb} ${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}${detail ? ` — ${detail}` : ""}`,
    collection,
    op: op === "append" || op === "update" || op === "delete" ? op : undefined,
    entityId: payload.id ?? item?.id,
    // Only what is needed to put it back. An append has nothing before it.
    before: payload.before === undefined ? undefined : JSON.stringify(payload.before),
  };
  setState((prev) => ({ ...prev, activity: [event, ...prev.activity] }));
  void mirrorOp("activity", "append", { item: event }, true);
}

/**
 * Can this change be put back?
 *
 * Only transactions, and only ones logged since the log started keeping the previous row.
 * Undoing a product or a setting is a different question — those have no stock movements
 * hanging off them and no obvious "back", so pretending the button works everywhere would be
 * worse than it only working here.
 */
export function canUndo(event: ActivityEvent): boolean {
  if (event.undoneAt) return false;
  if (event.collection !== "entries" || !event.entityId || !event.op) return false;
  if (event.op === "append") return state.entries.some((e) => e.id === event.entityId);
  return Boolean(event.before);
}

/**
 * Put a change back.
 *
 * Routed through the ordinary add/replace/delete functions rather than writing state
 * directly, so an undo moves stock and spends ingredients exactly the way the original did,
 * in reverse. An undo that quietly skipped the side effects would leave the shelf wrong in a
 * way nothing on screen could explain.
 */
export function undoActivity(eventId: string): boolean {
  const event = state.activity.find((a) => a.id === eventId);
  if (!event || !canUndo(event)) return false;
  const id = event.entityId as string;

  if (event.op === "append") {
    deleteEntry(id);
  } else if (event.op === "update") {
    const before = safeParse<Entry>(event.before);
    if (!before) return false;
    const { id: _ignored, ...rest } = before;
    void _ignored;
    replaceEntry(id, rest);
  } else if (event.op === "delete") {
    const before = safeParse<Entry>(event.before);
    if (!before) return false;
    addEntry(before);
  }

  const undoneAt = new Date().toISOString();
  let marked: ActivityEvent | undefined;
  setState((prev) => ({
    ...prev,
    activity: prev.activity.map((a) => {
      if (a.id !== eventId) return a;
      marked = { ...a, undoneAt };
      return marked;
    }),
  }));
  // Silent: the reversal is already written on the row it undid, and logging "edited an
  // activity" beneath it would read as a second, unrelated change.
  if (marked) void mirrorOp("activity", "update", { id: eventId, item: marked }, true);
  return true;
}

function safeParse<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Profiles are managed by /api/auth/profiles, never written as raw rows: the server hashes
 * PINs and decides who may add whom. These return the server's reason on failure so the
 * screen can say it ("only an executive can add people").
 */
async function profileRequest(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch("/api/auth/profiles", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) return { ok: false, reason: json.reason ?? "failed" };
    await refreshProfiles();
    return { ok: true };
  } catch {
    return { ok: false, reason: "offline" };
  }
}

export async function refreshProfiles(): Promise<AppUser[]> {
  try {
    const json = await fetch("/api/auth/profiles").then((r) => r.json());
    if (json.success && Array.isArray(json.profiles)) {
      setState((prev) => ({ ...prev, users: json.profiles as AppUser[] }));
      return json.profiles as AppUser[];
    }
  } catch {
    // keep what we have
  }
  return state.users;
}

export function createProfile(input: { name: string; pin: string; role: Role; color?: string }) {
  return profileRequest("POST", input);
}

export function updateProfile(id: string, patch: { name?: string; pin?: string; role?: Role; color?: string }) {
  return profileRequest("PATCH", { id, ...patch });
}

export function deleteProfile(id: string) {
  return profileRequest("DELETE", { id });
}

/** Pushes whatever's currently local up to Sheets exactly once, the first time the
 * sheet comes back empty for that collection — shared by every collection below so
 * the migration logic (and its "don't re-run, don't double-import" flag) isn't
 * duplicated five times. */
async function migrateCollectionIfEmpty<T>(
  canSeed: boolean,
  collectionName: string,
  flagKey: string,
  serverItems: T[],
  localItems: T[],
): Promise<{ items: T[]; migrated: boolean }> {
  if (!canSeed || serverItems.length > 0 || window.localStorage.getItem(flagKey)) {
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
    if (res.status === 401) {
      // Signed out on the server (cookie expired, or the profile was removed elsewhere).
      void signOut();
      return;
    }
    const json = await res.json();
    if (!json.success) return; // Sheets unreachable — keep local/paint-cache state
    // Seeding an empty sheet from this device's saved copy moved the shop's data into Sheets
    // once, back when it lived in the browser. That's long done, and the sheet is the record
    // now: an empty tab means it was cleared on purpose, so it is never refilled from here —
    // otherwise any open laptop would quietly bring back data that was deleted.
    const canSeed = false;

    const entriesMigration = await migrateCollectionIfEmpty<Entry>(
      canSeed,
      "entries",
      ENTRIES_MIGRATION_FLAG_KEY,
      Array.isArray(json.entries) ? json.entries : [],
      state.entries.filter((e) => !e.id.startsWith("seed-")),
    );

    const productsMigration = await migrateCollectionIfEmpty<ProductRow>(
      canSeed,
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
      canSeed,
      "rawMaterials",
      RAW_MATERIALS_MIGRATION_FLAG_KEY,
      Array.isArray(json.rawMaterials) ? json.rawMaterials : [],
      state.rawMaterials,
    );

    const suppliersMigration = await migrateCollectionIfEmpty<SupplierRow>(
      canSeed,
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

    const budgetsMigration = await migrateCollectionIfEmpty<BudgetRow>(
      canSeed,
      "budgets",
      BUDGETS_MIGRATION_FLAG_KEY,
      Array.isArray(json.budgets) ? json.budgets : [],
      recordToBudgetRows(state.categoryBudgets),
    );

    const eventsMigration = await migrateCollectionIfEmpty<BusinessEvent>(
      canSeed,
      "events",
      EVENTS_MIGRATION_FLAG_KEY,
      Array.isArray(json.events) ? json.events : [],
      state.events,
    );

    const eventStockMigration = await migrateCollectionIfEmpty<EventStockMovement>(
      canSeed,
      "eventStock",
      EVENT_STOCK_MIGRATION_FLAG_KEY,
      Array.isArray(json.eventStock) ? json.eventStock : [],
      state.eventStock,
    );

    const machinesMigration = await migrateCollectionIfEmpty<Machine>(
      canSeed,
      "machines",
      MACHINES_MIGRATION_FLAG_KEY,
      Array.isArray(json.machines) ? json.machines : [],
      state.machines,
    );

    const supplierPricesMigration = await migrateCollectionIfEmpty<SupplierPrice>(
      canSeed,
      "supplierPrices",
      SUPPLIER_PRICES_MIGRATION_FLAG_KEY,
      Array.isArray(json.supplierPrices) ? json.supplierPrices : [],
      state.supplierPrices,
    );

    const businessSettingsMigration = await migrateCollectionIfEmpty<BusinessSettingRow>(
      canSeed,
      "businessSettings",
      BUSINESS_SETTINGS_MIGRATION_FLAG_KEY,
      Array.isArray(json.businessSettings) ? json.businessSettings : [],
      businessSettingsToRows(state.businessSettings),
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
        categoryBudgets: budgetRowsToRecord(budgetsMigration.items),
        events: eventsMigration.items,
        eventStock: eventStockMigration.items,
        machines: machinesMigration.items,
        supplierPrices: supplierPricesMigration.items,
        users: Array.isArray(json.users) ? (json.users as AppUser[]) : prev.users,
        activity: Array.isArray(json.activity) ? (json.activity as ActivityEvent[]) : prev.activity,
        staff: Array.isArray(json.staff) ? (json.staff as StaffMember[]) : prev.staff,
        // A time-in still on its way to the sheet stays on screen until the sheet has it.
        timeRecords: Array.isArray(json.timeRecords) ? mergePending(json.timeRecords as TimeRecord[], prev.timeRecords) : prev.timeRecords,
        payroll: Array.isArray(json.payroll) ? mergePending(json.payroll as PayrollRecord[], prev.payroll) : prev.payroll,
        calendarItems: Array.isArray(json.calendarItems) ? mergePending(json.calendarItems as CalendarItem[], prev.calendarItems) : prev.calendarItems,
        stockTransfers: Array.isArray(json.stockTransfers) ? mergePending(json.stockTransfers as StockTransfer[], prev.stockTransfers) : prev.stockTransfers,
        businessSettings: businessSettingRowsToRecord(businessSettingsMigration.items),
        loadedFromServer: true,
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
    if (document.visibilityState === "visible" && pendingWrites === 0) void loadAllFromServer();
  }

  pollTimer = setInterval(tick, SYNC_POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", tick);
}

async function mirrorEntryAppend(entry: Entry): Promise<boolean> {
  return mirrorOp("entries", "append", { item: entry });
}

async function mirrorEntryUpdate(id: string, entry: Entry, before?: Entry): Promise<boolean> {
  return mirrorOp("entries", "update", { id, item: entry, before });
}

async function mirrorEntryDelete(id: string, before?: Entry) {
  await mirrorOp("entries", "delete", { id, before });
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

interface SideEffectResult {
  products: Product[];
  rawMaterials: RawMaterialStock[];
  /** Rows whose stock changed, so callers can push just those back to Sheets. */
  touchedProductIds: string[];
  touchedMaterialIds: string[];
}

/**
 * Share of raw cacao that survives roasting, as stored in settings. Kept here rather than
 * imported from summary/business-config so the store does not depend on a module that depends
 * on it.
 */
function utilizationOf(snapshot: { businessSettings: Record<string, string> }): number {
  const pct = Number(snapshot.businessSettings["cacaoUtilizationPct"]);
  return Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) / 100 : 1;
}

function applyEntrySideEffects(
  entry: Entry,
  direction: 1 | -1,
  products: Product[],
  rawMaterials: RawMaterialStock[],
  cacaoUtilization: number,
): SideEffectResult {
  const touchedProductIds: string[] = [];
  const touchedMaterialIds: string[] = [];
  if (!entry.quantity) return { products, rawMaterials, touchedProductIds, touchedMaterialIds };
  const delta = entry.quantity * direction;

  // Anything sold or lost at an event/distributor comes out of the stock that was already
  // moved there when it was sent out — deducting from main stock again would double-count it.
  // Its effect on the event's holdings is derived from the entry itself (see summary/events.ts).
  const drawsFromEventHoldings = Boolean(entry.eventId);

  // An order of several products takes each one off its own shelf, by product id.
  if (entry.type === "SALE" && entry.lineItems?.length) {
    if (drawsFromEventHoldings) return { products, rawMaterials, touchedProductIds, touchedMaterialIds };
    for (const line of entry.lineItems) {
      const product = (line.productId && products.find((p) => p.id === line.productId)) || findProduct(products, line.name);
      if (!product) continue;
      const lineDelta = line.quantity * direction;
      products = products.map((p) => (p.id === product.id ? { ...p, stockQty: Math.max(0, p.stockQty - lineDelta) } : p));
      touchedProductIds.push(product.id);
    }
    return { products, rawMaterials, touchedProductIds, touchedMaterialIds };
  }

  // Raw materials or packaging thrown away come off their own stock, never a product's.
  if (isMaterialWaste(entry)) {
    const material = findRawMaterialByName(rawMaterials, entry.sku);
    if (material) {
      rawMaterials = rawMaterials.map((m) => (m.id === material.id ? { ...m, qty: Math.max(0, m.qty - delta) } : m));
      touchedMaterialIds.push(material.id);
    }
    return { products, rawMaterials, touchedProductIds, touchedMaterialIds };
  }

  if (entry.type === "SALE" || entry.type === "INVENTORY_OUT" || entry.type === "WASTE") {
    if (drawsFromEventHoldings) return { products, rawMaterials, touchedProductIds, touchedMaterialIds };
    const product = findProduct(products, entry.sku);
    if (product) {
      products = products.map((p) => (p.id === product.id ? { ...p, stockQty: Math.max(0, p.stockQty - delta) } : p));
      touchedProductIds.push(product.id);
    }
  } else if (entry.type === "INVENTORY_IN") {
    const product = findProduct(products, entry.sku);
    if (product) {
      products = products.map((p) => (p.id === product.id ? { ...p, stockQty: Math.max(0, p.stockQty + delta) } : p));
      touchedProductIds.push(product.id);

      // Making jars SPENDS ingredients. This used to live in recordBatch alone, which meant
      // only the batch planner consumed anything: the same batch logged from Home, from Add
      // stock, or by the assistant added jars and quietly left the beans on the shelf. Stock
      // only ever went up, so the shopping list and every cost built on it drifted from
      // reality the moment she stopped using one particular button.
      //
      // It belongs here because this is the one place every entry passes through, including
      // edits and deletions — `direction` puts the ingredients back when a batch is undone.
      const batches = product.batchYield > 0 ? delta / product.batchYield : 0;
      if (batches !== 0) {
        for (const row of product.recipeIngredients) {
          const material = rawMaterials.find((m) => m.id === row.materialId);
          if (!material) continue;
          // Recipes are written in USABLE cacao; the shelf holds raw. Deducting the recipe
          // figure would leave phantom beans that cannot be roasted into anything.
          const used = rawQuantityNeeded(material.name, row.quantity, cacaoUtilization) * batches;
          rawMaterials = rawMaterials.map((m) =>
            m.id === material.id ? { ...m, qty: Math.max(0, m.qty - used) } : m,
          );
          touchedMaterialIds.push(material.id);
        }
        // In-house components (tablea in ice cream) come off their own shelf the same way.
        for (const row of product.recipeComponents ?? []) {
          if (row.productId === product.id) continue;
          const used = row.quantity * batches;
          products = products.map((p) => (p.id === row.productId ? { ...p, stockQty: Math.max(0, p.stockQty - used) } : p));
          touchedProductIds.push(row.productId);
        }
      }
    }
  } else if (entry.type === "EXPENSE" && (entry.category === "raw_materials" || entry.category === "packaging")) {
    const material = findRawMaterialByName(rawMaterials, entry.sku);
    if (material) {
      rawMaterials = rawMaterials.map((m) => (m.id === material.id ? { ...m, qty: Math.max(0, m.qty + delta) } : m));
      touchedMaterialIds.push(material.id);
    }
  }

  return { products, rawMaterials, touchedProductIds, touchedMaterialIds };
}

/**
 * Pushes stock rows that an entry just changed back to Sheets.
 *
 * Without this, logging a sale only ever moved stock in this browser's memory: the entry was
 * mirrored but the product's new stockQty never was, so the 30-second sync poll — which
 * overwrites products with whatever Sheets still says — silently undid every stock deduction.
 * Reads module `state`, so call it after setState has applied the change.
 */
function mirrorStockRows(productIds: string[], materialIds: string[]) {
  for (const id of new Set(productIds)) {
    const product = state.products.find((p) => p.id === id);
    if (product) void mirrorOp("products", "update", { id, item: toProductRow(product) }, true);
  }
  for (const id of new Set(materialIds)) {
    const material = state.rawMaterials.find((m) => m.id === id);
    if (material) void mirrorOp("rawMaterials", "update", { id, item: material }, true);
  }
}

export function addEntry(input: Omit<Entry, "id"> & { id?: string }): Entry {
  return addEntryTracked(input).entry;
}

/** Like addEntry, plus a promise that settles true once the server has confirmed the save. */
export function addEntryTracked(input: Omit<Entry, "id"> & { id?: string }): { entry: Entry; saved: Promise<boolean> } {
  // Stamped here rather than at each call site: there are half a dozen ways to log something
  // and a screen that forgot would leave a row nobody can account for.
  const who = currentUser();
  const entry: Entry = {
    ...input,
    id: input.id ?? genId("entry"),
    loggedById: input.loggedById ?? who?.id ?? null,
    loggedByName: input.loggedByName ?? who?.name ?? null,
  };
  pendingLocalEntryIds.add(entry.id);
  let touchedProductIds: string[] = [];
  let touchedMaterialIds: string[] = [];
  setState((prev) => {
    const result = applyEntrySideEffects(entry, 1, prev.products, prev.rawMaterials, utilizationOf(prev));
    touchedProductIds = result.touchedProductIds;
    touchedMaterialIds = result.touchedMaterialIds;
    return { ...prev, entries: [entry, ...prev.entries], products: result.products, rawMaterials: result.rawMaterials };
  });
  const saved = mirrorEntryAppend(entry);
  mirrorStockRows(touchedProductIds, touchedMaterialIds);
  return { entry, saved };
}

/** Removes an entry and reverses whatever stock/ingredient effects it applied. Used by Undo. */
export function deleteEntry(id: string) {
  const removed = state.entries.find((e) => e.id === id);
  if (!removed) return;
  pendingLocalEntryIds.delete(id);
  let touchedProductIds: string[] = [];
  let touchedMaterialIds: string[] = [];
  setState((prev) => {
    const entry = prev.entries.find((e) => e.id === id);
    if (!entry) return prev;
    const result = applyEntrySideEffects(entry, -1, prev.products, prev.rawMaterials, utilizationOf(prev));
    touchedProductIds = result.touchedProductIds;
    touchedMaterialIds = result.touchedMaterialIds;
    return {
      ...prev,
      entries: prev.entries.filter((e) => e.id !== id),
      products: result.products,
      rawMaterials: result.rawMaterials,
    };
  });
  void mirrorEntryDelete(id, removed);
  mirrorStockRows(touchedProductIds, touchedMaterialIds);
}

/** Replaces an entry's fields, reversing the old side effects and applying the new ones. Used by Edit. */
export function replaceEntry(id: string, next: Omit<Entry, "id">) {
  void replaceEntryTracked(id, next);
}

/** Like replaceEntry, plus a promise that settles true once the server has confirmed the change. */
export function replaceEntryTracked(id: string, next: Omit<Entry, "id">): Promise<boolean> {
  const previous = state.entries.find((e) => e.id === id);
  let updatedEntry: Entry | null = null;
  let touchedProductIds: string[] = [];
  let touchedMaterialIds: string[] = [];
  setState((prev) => {
    const old = prev.entries.find((e) => e.id === id);
    if (!old) return prev;
    const reversed = applyEntrySideEffects(old, -1, prev.products, prev.rawMaterials, utilizationOf(prev));
    updatedEntry = { ...next, id };
    const applied = applyEntrySideEffects(updatedEntry, 1, reversed.products, reversed.rawMaterials, utilizationOf(prev));
    touchedProductIds = [...reversed.touchedProductIds, ...applied.touchedProductIds];
    touchedMaterialIds = [...reversed.touchedMaterialIds, ...applied.touchedMaterialIds];
    return {
      ...prev,
      entries: prev.entries.map((e) => (e.id === id ? (updatedEntry as Entry) : e)),
      products: applied.products,
      rawMaterials: applied.rawMaterials,
    };
  });
  const saved = updatedEntry ? mirrorEntryUpdate(id, updatedEntry, previous) : Promise.resolve(false);
  mirrorStockRows(touchedProductIds, touchedMaterialIds);
  return saved;
}

// --- Products ------------------------------------------------------------

/**
 * The product minus its recipe, which lives in its own tab.
 *
 * Everything else is carried across by dropping those three keys rather than by listing the
 * ones to keep: a field listed nowhere is a field written to the sheet as blank on every
 * edit, which is how `unit`, `minutesPerBatch` and `laborCostOverride` were being erased
 * each time any part of a product was saved.
 */
function toProductRow(p: Product): ProductRow {
  const { recipeIngredients, recipeLabor, recipeMisc, recipeComponents, ...row } = p;
  void recipeIngredients;
  void recipeLabor;
  void recipeMisc;
  void recipeComponents;
  return row;
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
  if (patch.recipeIngredients || patch.recipeLabor || patch.recipeMisc || patch.recipeComponents) {
    mirrorProductRecipeDiff(oldProduct, newProduct);
  }
}

/**
 * Renames a product and every entry that refers to it. Entries link to a product by name
 * (Entry.sku), so renaming only the product would orphan its past sales from stock
 * matching, best sellers, and customer history.
 */
export function renameProduct(id: string, newName: string) {
  const trimmed = newName.trim();
  const product = state.products.find((p) => p.id === id);
  if (!product || !trimmed || trimmed === product.name) return;
  const oldKey = normalize(product.name);

  const changedEntries: Entry[] = [];
  setState((prev) => ({
    ...prev,
    products: prev.products.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
    entries: prev.entries.map((e) => {
      if (normalize(e.sku) !== oldKey) return e;
      const next = { ...e, sku: trimmed };
      changedEntries.push(next);
      return next;
    }),
  }));

  const renamed = state.products.find((p) => p.id === id);
  if (renamed) void mirrorOp("products", "update", { id, item: toProductRow(renamed) });
  for (const e of changedEntries) void mirrorEntryUpdate(e.id, e);
}

/** Removes a product and its recipe rows. Past entries keep the product's name as text,
 * so sales history and totals are unchanged — it just stops appearing in stock and pickers. */
export function deleteProduct(id: string) {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;
  setState((prev) => ({ ...prev, products: prev.products.filter((p) => p.id !== id) }));
  void mirrorOp("products", "delete", { id });
  for (const row of flattenProductRecipe(product)) void mirrorOp("recipes", "delete", { id: row.id });
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
  categoryBudgets?: Partial<Record<ExpenseCategory, number>>;
}) {
  setState((prev) => ({
    ...prev,
    products: data.products ?? prev.products,
    rawMaterials: data.rawMaterials ?? prev.rawMaterials,
    suppliers: data.suppliers ?? prev.suppliers,
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
  if (data.categoryBudgets) {
    for (const [category, amount] of Object.entries(data.categoryBudgets)) {
      void mirrorOp("budgets", "update", { id: category, item: { category, monthlyBudget: amount } });
    }
  }
}

// --- Events & event stock ----------------------------------------------------

export function addEvent(input: Omit<BusinessEvent, "id" | "createdAt">): BusinessEvent {
  const event: BusinessEvent = { ...input, id: genId("evt"), createdAt: new Date().toISOString() };
  setState((prev) => ({ ...prev, events: [...prev.events, event] }));
  void mirrorOp("events", "append", { item: event });
  return event;
}

export function updateEvent(id: string, patch: Partial<BusinessEvent>) {
  let updated: BusinessEvent | undefined;
  setState((prev) => ({
    ...prev,
    events: prev.events.map((e) => {
      if (e.id !== id) return e;
      updated = { ...e, ...patch };
      return updated;
    }),
  }));
  if (updated) void mirrorOp("events", "update", { id, item: updated });
}

export function deleteEvent(id: string) {
  setState((prev) => ({ ...prev, events: prev.events.filter((e) => e.id !== id) }));
  void mirrorOp("events", "delete", { id });
}

/**
 * Moves stock out of the main pool and into an event's holdings, or back again.
 *
 * Both directions are recorded as movement rows rather than adjusting a stored per-event
 * total, so an event's on-hand count is always recomputable from its movements and its
 * tagged sales (see summary/events.ts) and can never drift out of step with them.
 */
function moveEventStock(eventId: string, productId: string, type: "sent_out" | "sent_back", quantity: number) {
  if (quantity <= 0) return;
  const movement: EventStockMovement = {
    id: genId("evtstk"),
    eventId,
    productId,
    type,
    quantity,
    createdAt: new Date().toISOString(),
  };
  // Sending stock out takes it of main inventory now; from here on the event's own sales
  // draw it down instead of touching main stock again (see applyEntrySideEffects).
  const direction = type === "sent_out" ? -1 : 1;
  setState((prev) => ({
    ...prev,
    eventStock: [...prev.eventStock, movement],
    products: prev.products.map((p) =>
      p.id === productId ? { ...p, stockQty: Math.max(0, p.stockQty + direction * quantity) } : p,
    ),
  }));
  void mirrorOp("eventStock", "append", { item: movement });
  mirrorStockRows([productId], []);
}

export function sendStockToEvent(eventId: string, productId: string, quantity: number) {
  moveEventStock(eventId, productId, "sent_out", quantity);
}

export function sendStockBackFromEvent(eventId: string, productId: string, quantity: number) {
  moveEventStock(eventId, productId, "sent_back", quantity);
}

// --- Machines ----------------------------------------------------------------

export function addMachine(input: Omit<Machine, "id" | "createdAt">): Machine {
  const machine: Machine = { ...input, id: genId("mch"), createdAt: new Date().toISOString() };
  setState((prev) => ({ ...prev, machines: [...prev.machines, machine] }));
  void mirrorOp("machines", "append", { item: machine });
  return machine;
}

export function updateMachine(id: string, patch: Partial<Machine>) {
  let updated: Machine | undefined;
  setState((prev) => ({
    ...prev,
    machines: prev.machines.map((m) => {
      if (m.id !== id) return m;
      updated = { ...m, ...patch };
      return updated;
    }),
  }));
  if (updated) void mirrorOp("machines", "update", { id, item: updated });
}

export function deleteMachine(id: string) {
  setState((prev) => ({ ...prev, machines: prev.machines.filter((m) => m.id !== id) }));
  void mirrorOp("machines", "delete", { id });
}

// --- Supplier prices ---------------------------------------------------------

export function addSupplierPrice(input: Omit<SupplierPrice, "id" | "loggedAt"> & { loggedAt?: string }): SupplierPrice {
  const entry: SupplierPrice = { ...input, id: genId("sprice"), loggedAt: input.loggedAt ?? new Date().toISOString() };
  setState((prev) => ({ ...prev, supplierPrices: [...prev.supplierPrices, entry] }));
  void mirrorOp("supplierPrices", "append", { item: entry });
  return entry;
}

export function updateSupplierPrice(id: string, patch: Partial<SupplierPrice>) {
  let updated: SupplierPrice | undefined;
  setState((prev) => ({
    ...prev,
    supplierPrices: prev.supplierPrices.map((p) => {
      if (p.id !== id) return p;
      updated = { ...p, ...patch };
      return updated;
    }),
  }));
  if (updated) void mirrorOp("supplierPrices", "update", { id, item: updated });
}

export function deleteSupplierPrice(id: string) {
  setState((prev) => ({ ...prev, supplierPrices: prev.supplierPrices.filter((p) => p.id !== id) }));
  void mirrorOp("supplierPrices", "delete", { id });
}

// --- Business settings -------------------------------------------------------

function businessSettingsToRows(record: Record<string, string>): BusinessSettingRow[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

function businessSettingRowsToRecord(rows: BusinessSettingRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setBusinessSetting(key: string, value: string) {
  setState((prev) => ({ ...prev, businessSettings: { ...prev.businessSettings, [key]: value } }));
  void mirrorOp("businessSettings", "update", { id: key, item: { key, value } });
}

// --- Production batches ------------------------------------------------------

/**
 * Records a finished batch: jars go onto the shelf, the ingredients they consumed come off.
 *
 * The product side goes through addEntry so the run shows up in the ledger like any other
 * stock movement; the ingredient side is applied here, because entries only ever add raw
 * materials (an expense is a purchase) and nothing else deducts them.
 */
export function recordBatch(productId: string, jars: number) {
  const product = state.products.find((p) => p.id === productId);
  if (!product || jars <= 0) return;

  // The ingredient side used to be applied right here. It now rides on the INVENTORY_IN entry
  // instead, so that EVERY way of recording a batch spends the same ingredients — and so that
  // deleting the entry puts them back. Deducting here as well would charge the shelf twice.
  addEntry({
    timestamp: new Date().toISOString(),
    type: "INVENTORY_IN",
    amount: null,
    quantity: jars,
    unit: "jars",
    sku: product.name,
    counterparty: null,
    location: null,
    priceType: null,
    category: null,
    rawText: `Made ${jars} of ${product.name}`,
    confidence: 1,
    notes: null,
  });
}

// --- Salaries ----------------------------------------------------------------------------

/** Rows saved here but not yet back from the sheet, kept so a poll doesn't make them blink out. */
const pendingSalaryIds = new Set<string>();

function mergePending<T extends { id: string }>(server: T[], local: T[]): T[] {
  const ids = new Set(server.map((r) => r.id));
  for (const id of [...pendingSalaryIds]) if (ids.has(id)) pendingSalaryIds.delete(id);
  // While a change is in flight, the local copy is newer than the server's.
  const pending = local.filter((r) => pendingSalaryIds.has(r.id));
  const pendingIds = new Set(pending.map((r) => r.id));
  return [...server.filter((r) => !pendingIds.has(r.id)), ...pending];
}

async function saveSalaryRow(collection: "staff" | "timeRecords" | "payroll" | "calendarItems" | "stockTransfers", op: "append" | "update", item: { id: string }): Promise<boolean> {
  pendingSalaryIds.add(item.id);
  const ok = await mirrorOp(collection, op, { id: op === "update" ? item.id : undefined, item });
  // Once the server has it, the next poll will return it; until then keep showing ours.
  if (!ok) pendingSalaryIds.delete(item.id);
  return ok;
}

export function addStaff(input: Omit<StaffMember, "id" | "createdAt">): StaffMember {
  const member: StaffMember = { ...input, id: genId("stf"), createdAt: new Date().toISOString() };
  setState((prev) => ({ ...prev, staff: [...prev.staff, member] }));
  void saveSalaryRow("staff", "append", member);
  return member;
}

export function updateStaff(id: string, patch: Partial<StaffMember>) {
  const current = state.staff.find((s) => s.id === id);
  if (!current) return;
  const updated = { ...current, ...patch, id };
  setState((prev) => ({ ...prev, staff: prev.staff.map((s) => (s.id === id ? updated : s)) }));
  void saveSalaryRow("staff", "update", updated);
}

export function deleteStaff(id: string) {
  setState((prev) => ({ ...prev, staff: prev.staff.filter((s) => s.id !== id) }));
  void mirrorOp("staff", "delete", { id });
}

/** Adds or changes one person's day on the time record. Resolves true once the sheet has it. */
export function saveTimeRecord(record: Omit<TimeRecord, "id" | "createdAt"> & { id?: string; createdAt?: string }): Promise<boolean> {
  const existing = record.id
    ? state.timeRecords.find((r) => r.id === record.id)
    : state.timeRecords.find((r) => r.staffId === record.staffId && r.date === record.date);
  const who = currentUser();
  const row: TimeRecord = {
    ...record,
    id: existing?.id ?? genId("dtr"),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    loggedById: who?.id ?? null,
    loggedByName: who?.name ?? null,
  };
  setState((prev) => ({
    ...prev,
    timeRecords: existing ? prev.timeRecords.map((r) => (r.id === row.id ? row : r)) : [...prev.timeRecords, row],
  }));
  return saveSalaryRow("timeRecords", existing ? "update" : "append", row);
}

export function deleteTimeRecord(id: string) {
  setState((prev) => ({ ...prev, timeRecords: prev.timeRecords.filter((r) => r.id !== id) }));
  void mirrorOp("timeRecords", "delete", { id });
}

/**
 * Pays someone: records the payment on Payroll and, with it, a salary expense in Transactions
 * (category Labor — hidden from employees), so it counts in money paid and money earned.
 */
export function recordSalaryPayment(input: Omit<PayrollRecord, "id" | "createdAt" | "entryId">, staffName: string, label: string): PayrollRecord {
  const [y, m, d] = input.paidOn.split("-").map(Number);
  const now = new Date();
  const entry = addEntry({
    timestamp: new Date(y, m - 1, d, now.getHours(), now.getMinutes()).toISOString(),
    type: "EXPENSE",
    amount: input.net,
    quantity: null,
    unit: null,
    sku: label,
    counterparty: staffName,
    location: null,
    priceType: null,
    category: "labor",
    rawText: "Salaries tab",
    confidence: 1,
    notes:
      [
        input.sss + input.philhealth + input.pagibig > 0
          ? `Less SSS ${formatPeso(input.sss)}, PhilHealth ${formatPeso(input.philhealth)}, Pag-IBIG ${formatPeso(input.pagibig)}`
          : "",
        input.deductions > 0 ? `Less ${formatPeso(input.deductions)}${input.deductionNote ? ` (${input.deductionNote})` : ""}` : "",
      ]
        .filter(Boolean)
        .join("; ") || null,
    paymentTerm: "spot",
    paymentMethod: "cash",
  });
  const record: PayrollRecord = { ...input, id: genId("pay"), entryId: entry.id, createdAt: new Date().toISOString() };
  setState((prev) => ({ ...prev, payroll: [...prev.payroll, record] }));
  void saveSalaryRow("payroll", "append", record);
  return record;
}

/** Takes a payment back — the payroll row and the salary expense it recorded. */
export function undoSalaryPayment(id: string) {
  const record = state.payroll.find((p) => p.id === id);
  if (!record) return;
  setState((prev) => ({ ...prev, payroll: prev.payroll.filter((p) => p.id !== id) }));
  void mirrorOp("payroll", "delete", { id });
  if (record.entryId && state.entries.some((e) => e.id === record.entryId)) deleteEntry(record.entryId);
}

/**
 * Sends a month's contributions to SSS, PhilHealth or Pag-IBIG: the workers' shares already
 * taken from their pay plus the shop's share, recorded as one expense in Transactions.
 */
export function recordRemittance(agency: "sss" | "philhealth" | "pagibig", agencyName: string, month: string, amount: number, paidOn: string): PayrollRecord {
  const [y, m, d] = paidOn.split("-").map(Number);
  const now = new Date();
  const monthLabel = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  const entry = addEntry({
    timestamp: new Date(y, m - 1, d, now.getHours(), now.getMinutes()).toISOString(),
    type: "EXPENSE",
    amount,
    quantity: null,
    unit: null,
    sku: `${agencyName} contributions — ${monthLabel}`,
    counterparty: agencyName,
    location: null,
    priceType: null,
    category: "labor",
    rawText: "Salaries tab",
    confidence: 1,
    notes: "Workers' shares (taken from pay) plus the shop's share",
    paymentTerm: "spot",
  });
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const record: PayrollRecord = {
    id: genId("pay"),
    staffId: agency,
    kind: "remittance",
    periodStart: `${month}-01`,
    periodEnd: `${month}-${String(lastDay).padStart(2, "0")}`,
    basic: 0,
    overtime: 0,
    deductions: 0,
    deductionNote: "",
    net: amount,
    paidOn,
    entryId: entry.id,
    createdAt: new Date().toISOString(),
    sss: agency === "sss" ? amount : 0,
    philhealth: agency === "philhealth" ? amount : 0,
    pagibig: agency === "pagibig" ? amount : 0,
  };
  setState((prev) => ({ ...prev, payroll: [...prev.payroll, record] }));
  void saveSalaryRow("payroll", "append", record);
  return record;
}

// --- Calendar items ------------------------------------------------------------------------

export function addCalendarItem(input: Omit<CalendarItem, "id" | "createdAt" | "ownerId" | "ownerName">): CalendarItem {
  const who = currentUser();
  const item: CalendarItem = { ...input, id: genId("cal"), ownerId: who?.id ?? "", ownerName: who?.name ?? "", createdAt: new Date().toISOString() };
  setState((prev) => ({ ...prev, calendarItems: [...prev.calendarItems, item] }));
  void saveSalaryRow("calendarItems", "append", item);
  return item;
}

export function updateCalendarItem(id: string, patch: Partial<CalendarItem>) {
  const current = state.calendarItems.find((c) => c.id === id);
  if (!current) return;
  const updated = { ...current, ...patch, id };
  setState((prev) => ({ ...prev, calendarItems: prev.calendarItems.map((c) => (c.id === id ? updated : c)) }));
  void saveSalaryRow("calendarItems", "update", updated);
}

export function deleteCalendarItem(id: string) {
  setState((prev) => ({ ...prev, calendarItems: prev.calendarItems.filter((c) => c.id !== id) }));
  void mirrorOp("calendarItems", "delete", { id });
}

// --- Branches ------------------------------------------------------------------------------

/** Moves stock from one branch to another. The total doesn't change; where it is does. */
export function addStockTransfer(input: Omit<StockTransfer, "id" | "createdAt" | "loggedByName">): StockTransfer {
  const t: StockTransfer = { ...input, id: genId("mov"), loggedByName: currentUser()?.name ?? null, createdAt: new Date().toISOString() };
  setState((prev) => ({ ...prev, stockTransfers: [...prev.stockTransfers, t] }));
  void saveSalaryRow("stockTransfers", "append", t);
  return t;
}

export function deleteStockTransfer(id: string) {
  setState((prev) => ({ ...prev, stockTransfers: prev.stockTransfers.filter((t) => t.id !== id) }));
  void mirrorOp("stockTransfers", "delete", { id });
}
