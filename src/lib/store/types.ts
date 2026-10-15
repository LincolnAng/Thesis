export type EntryType =
  | "SALE"
  | "EXPENSE"
  /** Money spent trying something that is not yet a product — recipe trials, samples,
   *  packaging mock-ups. Money out like any expense, but kept apart so the cost of
   *  experimenting can be seen rather than buried in the ingredients line. */
  | "RND"
  | "INVENTORY_IN"
  | "INVENTORY_OUT"
  | "WASTE"
  | "SUPPLIER"
  | "NOTE";

export type PriceType = "standard" | "friend" | "wholesale" | null;

/**
 * When the money changes hands. Spot: paid on the spot. Receivable: a customer still owes it
 * (a sale on credit — utang). Payable: the business still owes it (bought on credit).
 * Missing on rows written before payment terms existed, which read as spot.
 */
export type PaymentTerm = "spot" | "payable" | "receivable";

/** Noted by hand on a payable or receivable: nothing paid yet, some paid, or all paid. */
export type PaymentStatus = "pending" | "partial" | "settled";

// The 6 built-ins below always exist; a plain string (not a closed union) so the
// owner can add their own categories from the Expenses budget editor — anything
// not in EXPENSE_CATEGORY_LABELS just displays as its own raw name.
export type ExpenseCategory = string;

export const BUILT_IN_EXPENSE_CATEGORIES = [
  "raw_materials",
  "labor",
  "utilities",
  "packaging",
  "transport",
  "events",
  "distribution",
  "misc",
] as const;

export interface Entry {
  id: string;
  timestamp: string; // ISO date
  type: EntryType;
  amount: number | null; // pesos
  quantity: number | null;
  unit: string | null; // jars, kg, pcs, etc.
  sku: string | null; // product name
  counterparty: string | null; // buyer / supplier name
  location: string | null;
  priceType: PriceType;
  category: ExpenseCategory | null;
  rawText: string;
  confidence: number; // 0-1
  notes?: string | null;
  /** Set when this sale/removal happened at an event or distributor rather than through
   * normal business operations. Stock for these was already taken out of the main pool when
   * it was sent out, so an event-tagged entry draws down that event's holdings instead of
   * deducting from main stock a second time — see applyEntrySideEffects in store.ts. */
  eventId?: string | null;
  /** Who was signed in when this was saved. Empty on rows written before people existed. */
  loggedByName?: string | null;
  loggedById?: string | null;
  /** Spot unless set. Only sales can be receivable and only expenses payable. */
  paymentTerm?: PaymentTerm | null;
  /** "YYYY-MM-DD" — when a payable or receivable is expected to be paid. */
  dueDate?: string | null;
  /** How much of a payable or receivable has been paid so far, in pesos. */
  amountPaid?: number | null;
  paymentStatus?: PaymentStatus | null;
  /** When it was marked fully paid. */
  settledAt?: string | null;
}

export interface RecipeIngredientRow {
  id: string;
  materialId: string; // references RawMaterialStock.id — cost lives there, not here
  quantity: number; // amount of that material used per batch, in the material's own unit
}

export interface RecipeExtraRow {
  id: string;
  label: string;
  cost: number; // cost per batch, in pesos
}

// manual = self pricing; cost_percent = cost + markup %; margin = profit as a % of the
// selling price. marginPercent holds the % for both
// cost_percent (as markup) and margin (as margin) — see lib/summary/pricing-methods.ts.
export type PricingMode = "manual" | "cost_percent" | "margin";

export interface Product {
  id: string;
  name: string;
  standardPrice: number;
  pricingMode: PricingMode; // how the price is set; only "manual" uses standardPrice directly
  marginPercent: number; // markup % (cost_percent) or margin % (margin)
  /** Retired with the market-based pricing mode. Kept so the sheet column still round-trips. */
  marketPrice: number;
  /**
   * What distinguishes this from its siblings — "100g", "250g", "gift box".
   *
   * A size is a full product underneath: its own recipe, cost, price and stock. Only the
   * family name is shared, so Inventory can show "Classic Cacao Spread" once with its sizes
   * beneath it rather than three unrelated rows that happen to start with the same words.
   */
  sizeLabel?: string | null;
  /** The product this is a size OF. Null on a product that is not a size of anything. */
  sizeOfId?: string | null;
  /**
   * How this one is sold in bulk, when it differs from the shop's default.
   *
   * Null means "use the default in Settings". Products do not share a bulk method: a spread
   * may go out in cases of 25 while a crunch goes in trays of 12, and one global number
   * would quietly convert one of them wrongly.
   */
  bulkSize?: number | null;
  bulkWord?: string | null;
  friendPrice: number;
  wholesalePrice: number;
  stockQty: number;
  lowStockThreshold: number;
  batchYield: number; // jars produced per batch
  /** What one of this product is called when a quantity is entered — jars, bottles, packs.
   * Set once in the product's own settings so nobody has to pick a unit per transaction.
   * Empty on rows written before this column existed; read it through `productUnit`. */
  unit?: string;
  /** Hands-on time one batch takes. Labor cost is derived from this and the hourly rate in
   * settings, so a change to the rate reprices every product at once. */
  minutesPerBatch?: number;
  /** A labor figure typed in directly. When set it wins over the derived one, and the UI
   * says so — existing per-batch labor costs migrated here rather than being recomputed
   * into something the owner never entered. */
  laborCostOverride?: number | null;
  recipeIngredients: RecipeIngredientRow[];
  recipeLabor: RecipeExtraRow[];
  recipeMisc: RecipeExtraRow[];
}

export type SupplierType = "packaging" | "raw_materials";

export interface PriceHistoryPoint {
  date: string;
  price: number;
}

export interface Supplier {
  id: string;
  name: string;
  type: SupplierType;
  items: string; // free text: what they supply
  lastPrice: number;
  priceHistory: PriceHistoryPoint[];
  contact: string;
}

/** Separates what goes *in* the jar from the jar itself, so cost can be broken out per line
 * instead of arriving as one undifferentiated "ingredients" figure. */
export type MaterialKind = "ingredient" | "packaging";

export interface RawMaterialStock {
  id: string;
  name: string; // cocoa beans, jars, labels, oil, sugar
  unit: string; // kg, pcs, L
  qty: number;
  lowStockThreshold: number;
  perBatchQty: number | null; // how much one production batch uses, for "enough for N batches"
  color: string | null; // user-chosen hex override for the stock calendar line; null = auto (urgency-based)
  /** Fallback cost per unit, used only when no supplier has logged a price for this material.
   * Supplier-logged prices are authoritative — see getUnitCost in summary/cost-engine.ts. */
  unitCost: number;
  kind?: MaterialKind;
  /** Restock when on-hand falls to this. A real threshold the owner sets, used instead of
   * a projected run-out date when there isn't enough sales history to project from. */
  reorderPoint?: number | null;
}

/**
 * One price a supplier charged for one ingredient, as actually paid: the peso amount, and
 * how much it bought. Cost per unit is derived (price / quantity), never stored, because a
 * supplier quoting "₱90" means nothing until you know whether that bought a kilo or half of
 * one. Several suppliers can price the same ingredient, which is what makes them comparable.
 */
export interface SupplierPrice {
  id: string;
  supplierId: string;
  materialId: string;
  price: number;
  quantity: number;
  unit: string;
  loggedAt: string;
}


export interface TokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedBudgetTokens: number; // ceiling before "low credits" warning
}

export interface AiStatus {
  apiKeyMissing: boolean;
}

/** A sales channel that holds its own stock: a one-off event (Ayala Mall, IFEX) or an
 * ongoing distributor (Nomad, Bandera, Otop Ginhawa). Named BusinessEvent rather than Event
 * so it doesn't shadow the DOM's global Event type. */
export interface BusinessEvent {
  id: string;
  name: string;
  kind: "event" | "distributor";
  startDate: string | null; // ISO date; distributors are usually open-ended
  endDate: string | null;
  status: "open" | "closed";
  notes: string;
  createdAt: string;
}

/** One movement of stock between the main inventory pool and an event's holdings. Holdings
 * are always recomputed from these rows plus the event's sales — never stored as a running
 * total, so they can't drift. */
export interface EventStockMovement {
  id: string;
  eventId: string;
  productId: string;
  /**
   * "sent_out" — stock left the shelf for a bazaar or distributor.
   * "sent_back" — unsold stock came home.
   *
   * These were "borrow" and "return", which read fine in code and badly in the spreadsheet the
   * owner actually opens: nobody is lending anything. Legacy rows still say borrow/return and
   * are mapped on read — see sheets/events.ts.
   */
  type: "sent_out" | "sent_back";
  quantity: number;
  createdAt: string;
}

/** A piece of equipment production has to run through. Capacity is expressed in batches
 * rather than jars because a batch is the unit the recipes and yields are already written in
 * — the same grinder makes one batch whether that batch yields 20 jars or 40. */
export interface Machine {
  id: string;
  name: string;
  /** Batches this machine can finish in a single working day. */
  batchesPerDay: number;
  /** How many days a week it runs, counted from Monday — 6 means Mon-Sat. */
  workingDaysPerWeek: number;
  notes: string;
  createdAt: string;
}

export interface SyncStatus {
  /** True if the most recently settled write to Google Sheets failed. Clears
   * on the next write that succeeds — it does not mean the failed write was
   * retried, only that something didn't save and hasn't been confirmed since. */
  failing: boolean;
  failedAt: string | null;
}

/**
 * What a profile can see and do. Executives see everything; employees log sales, spoilage and
 * batches but never costs, margins, R&D or payroll. Enforced on the server (lib/auth/permissions),
 * so hiding a screen is only ever the polite half of it.
 */
export type Role = "executive" | "employee";

/**
 * Someone who uses this app, as every device sees them. The PIN itself never leaves the server:
 * `hasPin` is all the profile picker needs to know. See lib/sheets/users.ts for the stored row.
 */
export interface AppUser {
  id: string;
  name: string;
  role: Role;
  /** Tile colour, saved with the profile so it looks the same on every device. */
  color: string;
  hasPin: boolean;
  createdAt: string;
}

/** One line in the "who changed what" log. */
export interface ActivityEvent {
  id: string;
  at: string;
  userId: string;
  userName: string;
  /** Already written as a sentence fragment: "added a transaction — Sale · Classic". */
  action: string;
  /** Which collection changed, so an edit can be found again. Empty on rows logged before
   *  the log started recording it. */
  collection?: string;
  op?: "append" | "update" | "delete";
  entityId?: string;
  /**
   * The row as it stood BEFORE this change, as JSON — the only thing that makes an undo
   * possible. An append has nothing before it; a delete has everything.
   */
  before?: string;
  /** Set once this change has been undone, so the log shows the reversal rather than hiding it. */
  undoneAt?: string;
}
