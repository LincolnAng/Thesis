export type EntryType =
  | "SALE"
  | "EXPENSE"
  /** Money spent trying something that is not yet a product — recipe trials, samples,
   *  packaging mock-ups. Money out like any expense, but kept apart so the cost of
   *  experimenting can be seen rather than buried in the ingredients line. */
  | "RND"
  /** Money put into the business by an owner or investor. Money in, but never a sale:
   *  kept out of sales, revenue and earnings. Recorded when the money actually arrives. */
  | "CAPITAL"
  /** Money the business spends on something it keeps — machinery, a freezer, equipment.
   *  Money out when paid (a payable until then), but not an everyday operating expense,
   *  so it stays out of expenses and earnings. */
  | "ASSET"
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

/** Noted by hand on a payable or receivable: nothing paid yet, some paid, all paid — or
 *  given up on (defaulted), which keeps its unpaid balance on the books as still owed. */
export type PaymentStatus = "pending" | "partial" | "settled" | "defaulted";

/** One product in a multi-product order, with the price it actually sold at. */
export interface OrderLine {
  /** Null when the product has since been removed from Costing. */
  productId: string | null;
  /** The product's name (and size) when it was sold. */
  name: string;
  quantity: number;
  /** Price per unit at the time of the sale — kept, so later price changes don't rewrite history. */
  unitPrice: number;
}

/** How money changed hands. The bank is named, never an account number or balance. A check
 *  (often post-dated, one per instalment) names the bank it's drawn on. */
export type PaymentMethod = "cash" | "bank_transfer" | "ewallet" | "check";

export type InstallmentFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

/**
 * Paying (or being paid) in instalments: `count` equal payments, one each `frequency`, the first
 * due on `firstDue`. Each instalment's due date is worked out from these (lib/transactions/
 * ledger installmentSchedule), and payments made are applied to the earliest first.
 */
export interface InstallmentPlan {
  frequency: InstallmentFrequency;
  count: number;
  firstDue: string;
}

/**
 * One actual receipt or payment against a receivable or payable. The obligation keeps its
 * original amount; what has been paid is the sum of these, so nothing is ever rewritten to
 * make a balance look right.
 */
export interface PaymentRecord {
  id: string;
  /** "YYYY-MM-DD" — the day the money changed hands. */
  date: string;
  amount: number;
  /** "cash", "bank_transfer", or null for a payment carried in from before methods were kept. */
  method: string | null;
  bankName: string | null;
  note: string | null;
  recordedById?: string | null;
  recordedByName?: string | null;
}

/** A change to the agreed deadline, kept so an earlier due date is never silently erased. */
export interface DueDateChange {
  from: string | null;
  to: string | null;
  changedAt: string;
  changedByName?: string | null;
  reason?: string | null;
}

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
  /** A sale of several products as one order. `quantity` is then the total units and `amount`
   *  the order total; `sku` names the products for display. */
  lineItems?: OrderLine[] | null;
  /** How it was (or will be) paid. */
  paymentMethod?: PaymentMethod | null;
  bankName?: string | null;
  /** Payments made against a payable or receivable, each dated. When present they are the
   *  record of what was paid; `amountPaid` is kept equal to their sum for older readers. */
  payments?: PaymentRecord[] | null;
  /** The credit arrangement on a payable or receivable: "net_30", "date", … (see PAYMENT_TERMS). */
  paymentTerms?: string | null;
  /** Every time the due date was moved, oldest first. */
  dueDateHistory?: DueDateChange[] | null;
  /** When the owner confirmed it defaulted. Kept after it is paid, as part of its history. */
  defaultedAt?: string | null;
  /** A payable or receivable paid in instalments. `dueDate` is then the last instalment's. */
  installments?: InstallmentPlan | null;
  /** The branch it happened at (lib/inventory/locations). Empty means the main branch. */
  branch?: string | null;
  /** A batch's lot number, as written on the label. */
  lotId?: string | null;
  /** "YYYY-MM-DD" a batch is good until, when set at the time — otherwise made + shelf life. */
  expiresOn?: string | null;
  /** The packaging a batch actually used, taken off its stock in place of the recipe's. Can also
   *  name another material with what it really drew — 0 for the raw material a production run's
   *  roast already took off the shelf. */
  packagingUsed?: { materialId: string; qty: number }[] | null;
  /** Repacked from the tingi bucket: already-made product, so it draws no ingredients. */
  fromTingi?: boolean | null;
  /**
   * The production run (ProductionRun) this belongs to: the roast that took the raw cacao off
   * the shelf, or a batch made from that roast — which then draws no raw cacao of its own.
   */
  runId?: string | null;
}

export interface RecipeIngredientRow {
  id: string;
  materialId: string; // references RawMaterialStock.id — cost lives there, not here
  quantity: number; // amount of that material used per batch, in the material's own unit
}

/**
 * Something made in-house that goes into another product — tablea into ice cream or brandy.
 * The component is a product of its own (its own recipe, stock, batches and expiry); a batch
 * of the product that uses it draws its stock down, the way a batch draws down beans.
 */
export interface RecipeComponentRow {
  id: string;
  productId: string; // the in-house product used — references Product.id
  quantity: number; // how much of it one batch uses, in that product's own unit
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
  /** In-house products this one is made from. Missing on products saved before components. */
  recipeComponents?: RecipeComponentRow[];
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

/** One thing a machine turns out, and how fast. */
export interface MachineOutput {
  /** A product's id, or a raw material's when `kind` is "material". */
  itemId: string;
  kind: "product" | "material";
  /** How many it makes in one hour or one day, in the item's own unit (jars, kg…). */
  qty: number;
  per: "hour" | "day";
}

/** A piece of equipment the owner bought, what it makes and how fast. Capacity is in the
 * item's own unit per hour or per day — the owner knows "the grinder does 5 kg an hour",
 * not how many batches that is. A machine that makes several things splits its day between
 * them. */
export interface Machine {
  id: string;
  name: string;
  outputs: MachineOutput[];
  /** Hours it runs on a working day, for outputs given per hour. */
  hoursPerDay: number;
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
export type Role = "executive" | "admin" | "employee";

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

// --- Salaries ---------------------------------------------------------------------------
// Executives only: an employee's copy of Staff carries names (to time in) and nothing else,
// and Payroll never reaches them (lib/auth/permissions).

export type PayType = "monthly" | "daily";

/** Someone the shop pays. Names and rates live in the sheet, never in the code. */
export interface StaffMember {
  id: string;
  name: string;
  payType: PayType;
  /** Pesos a month, or a day, by payType. */
  rate: number;
  /** What they do — "Secretary (part-time for MKC)". */
  position: string;
  pwd: boolean;
  /** The app profile that times in as this person, if any. */
  userId: string | null;
  /** First day of work, "YYYY-MM-DD"; pay before it isn't owed. */
  startDate: string | null;
  active: boolean;
  /** Paid an allowance, not a salary: no absence deductions and no SSS, PhilHealth or Pag-IBIG. */
  allowanceOnly: boolean;
  createdAt: string;
}

/** Present = a full day; half = half a day; off = day off or rest day (unpaid for daily staff). */
export type DayStatus = "present" | "half" | "absent" | "off" | "leave";

/** One person's day on the daily time record (DTR). */
export interface TimeRecord {
  id: string;
  staffId: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM", 24-hour. */
  timeIn: string | null;
  timeOut: string | null;
  /** "HH:MM" — lunch or rest break; 30 minutes is allowed (lib/payroll/pay). */
  breakStart?: string | null;
  breakEnd?: string | null;
  status: DayStatus;
  /** Overtime hours an Executive approved. Only approved hours are paid. */
  otHours: number;
  note: string;
  loggedById?: string | null;
  loggedByName?: string | null;
  createdAt: string;
}

/**
 * A payment: to someone on a regular payday or for their 13th month pay, or — kind "remittance"
 * — the month's contributions paid to SSS, PhilHealth or Pag-IBIG (staffId is then the agency).
 */
export interface PayrollRecord {
  id: string;
  staffId: string;
  kind: "regular" | "13th" | "remittance";
  periodStart: string;
  periodEnd: string;
  basic: number;
  overtime: number;
  /** Cash advances (bale) or anything else taken off. */
  deductions: number;
  deductionNote: string;
  /** Added by hand at pay time — an allowance, a bonus, a correction. */
  additions?: number;
  additionNote?: string;
  net: number;
  paidOn: string;
  /** The salary expense this payment recorded in Transactions. */
  entryId: string | null;
  createdAt: string;
  /** Employee shares taken off this payday (0 when none). For a remittance: the total sent. */
  sss: number;
  philhealth: number;
  pagibig: number;
}

// --- The calendar's own items -----------------------------------------------------------

/** What someone put on the calendar themselves — the kinds offered, though any can be typed. */
export type AgendaKind = "event" | "task" | "meeting" | "delivery" | "receivable" | "payable" | "reminder";

/** Who sees an item: only its owner, everyone, or the people it was shared with. */
export type AgendaVisibility = "private" | "everyone" | "people";

/** Something put on the calendar by hand — an event, a task, a meeting with a client, a deadline. */
export interface CalendarItem {
  id: string;
  title: string;
  kind: AgendaKind;
  /** "YYYY-MM-DD" */
  date: string;
  /** Last day, for something over several days. */
  endDate: string | null;
  /** "HH:MM" — empty for an all-day item. */
  startTime: string | null;
  endTime: string | null;
  location: string;
  notes: string;
  ownerId: string;
  ownerName: string;
  visibility: AgendaVisibility;
  /** Profile ids, when shared with particular people. */
  sharedWith: string[];
  /** For tasks and deadlines: ticked off. */
  done: boolean;
  createdAt: string;
}

/**
 * One movement in a product's tingi bucket — the loose amount left over from a batch that
 * doesn't fill a jar. Put in when a batch is made; taken out when it's repacked or used in
 * another product. The bucket is what's been put in minus what's been taken out.
 */
export interface TingiMove {
  id: string;
  productId: string;
  direction: "in" | "out";
  qty: number;
  unit: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** The batch it came from, for what's put in. */
  lotId: string;
  /** What it was used for, for what's taken out. */
  usedForProductId: string | null;
  note: string;
  /** The production run it was left over from or went into, when there was one. */
  runId?: string | null;
  loggedByName?: string | null;
  createdAt: string;
}

/**
 * One production run, as logged in Production: raw cacao fed into the roaster, the usable
 * cacao that came out, the tablea pellets made from it, how many of those went into finished
 * products, and what was left over (into a product's tingi). The roast and the batches are entries carrying this run's id;
 * the tingi moves carry it too. Quantities are in the cacao material's own unit.
 */
export interface ProductionRun {
  id: string;
  /** What the batch is called — "Tablea for Ayala bazaar". Empty on runs logged before names. */
  name: string;
  /** "YYYY-MM-DD" */
  date: string;
  lotId: string;
  /** The raw material put in — usually cacao beans. */
  materialId: string;
  unit: string;
  /** Raw material put in (cacao fed into the roaster). 0 when it all came from the bucket. */
  rawQty: number;
  /** What was usable from it (usable cacao out of the roast). */
  usableQty: number;
  /** Tablea pellets made from the usable cacao — the step between roasting and the packs. */
  pelletsQty: number;
  /** Tingi (pellets left over from earlier runs) taken for this run. */
  fromBucketQty: number;
  /** Tablea pellets that went into the finished products. */
  intoProductsQty: number;
  /** Pellets left over, put into a product's tingi. */
  leftoverQty: number;
  /** "Tablea · 100g × 40; Spread × 12" — for whoever reads the sheet; the batches are the record. */
  made: string;
  notes: string;
  loggedByName?: string | null;
  createdAt: string;
  /** Every raw material (or packaging) put in, each with its own amount and unit. */
  inputs?: RunInput[] | null;
  /** Lost in the making — shells, burnt bits. */
  wasteQty?: number;
  /** Made but not packed — powder, pellets, brandy or ice cream left over. Counted as waste. */
  excessQty?: number;
}

/** One raw material put into a production run. */
export interface RunInput {
  materialId: string;
  qty: number;
  unit: string;
}

/** Stock moved from one branch to another — shipped to Manila, brought back to CDO. */
export interface StockTransfer {
  id: string;
  productId: string;
  fromBranch: string;
  toBranch: string;
  quantity: number;
  /** "YYYY-MM-DD" */
  date: string;
  note: string;
  loggedByName?: string | null;
  createdAt: string;
}
