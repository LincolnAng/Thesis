import type { ActivityEvent, CalendarItem, Entry, EntryType, PayrollRecord, RawMaterialStock, Role, StaffMember, StockTransfer, TimeRecord, TingiMove, ProductionRun } from "@/lib/store/types";
import type { ProductRow, RecipeRow } from "@/lib/store/sheet-shapes";
import { entryIntegrityProblem } from "@/lib/transactions/ledger";
import { daysIn, periodFor } from "@/lib/payroll/pay";

/**
 * What each role may read and write — the one place that decides it, run on the server by
 * /api/business-data. Pure functions over plain rows, so the rules can be tested without a
 * spreadsheet (permissions.test.ts).
 *
 * Executives see and change everything. Employees log sales, spoilage, batches and event
 * stock, and see stock levels and selling prices — but never a cost, a margin, R&D, an expense
 * (payroll lives there), a supplier price, a budget, or the change log (whose "before" copies
 * would leak all of the above). They see and change only their own time in and out — never
 * anyone else's, a rate or a payslip.
 *
 * The Google Sheet itself is outside these rules: anyone with access to it reads everything.
 */

export type CollectionName =
  | "entries"
  | "products"
  | "recipes"
  | "rawMaterials"
  | "suppliers"
  | "supplierPriceHistory"
  | "budgets"
  | "events"
  | "eventStock"
  | "machines"
  | "supplierPrices"
  | "businessSettings"
  | "users"
  | "activity"
  | "staff"
  | "timeRecords"
  | "payroll"
  | "calendarItems"
  | "stockTransfers"
  | "tingi"
  | "productionRuns";

export type WriteOp = "append" | "update" | "delete" | "migrate";

/** Payment terms on a sale — who owes what, and when. Executives only; see redactForEmployee. */
// How something was paid (cash, bank, e-wallet, cheque) is everyday information everyone records
// and sees. Who still owes what, when, and on what terms stays with Executives.
const PAYMENT_FIELDS = ["paymentTerm", "dueDate", "amountPaid", "paymentStatus", "settledAt", "payments", "paymentTerms", "dueDateHistory", "defaultedAt", "installments"] as const;

function withoutPaymentFields<T extends object>(entry: T): T {
  const copy = { ...entry } as Record<string, unknown>;
  for (const f of PAYMENT_FIELDS) delete copy[f];
  return copy as T;
}

/** Entry types an employee can see and record. Investments (capital, assets) stay owner-only. */
export const EMPLOYEE_ENTRY_TYPES: readonly EntryType[] = ["SALE", "EXPENSE", "WASTE", "INVENTORY_IN", "INVENTORY_OUT", "NOTE"];

/**
 * Expense categories an employee never sees or records: what people are paid. Employees can
 * log everyday expenses — supplies, fares, packaging — but salaries stay with the owners.
 */
export const PAYROLL_CATEGORIES = new Set(["labor", "payroll", "salary", "salaries", "sweldo"]);

export function isPayroll(entry: Pick<Entry, "type" | "category">): boolean {
  return entry.type === "EXPENSE" && PAYROLL_CATEGORIES.has((entry.category ?? "").trim().toLowerCase());
}

/** Business settings an employee's screens need — production and calendar, nothing financial. */
const EMPLOYEE_SETTING_KEYS = new Set([
  "ownerName",
  "cacaoUtilizationPct",
  "expiringWithinDays",
  "wholesaleCaseSize",
  "wholesaleCaseWord",
  "unavailableDays",
  // The branches, for Inventory.
  "branches",
]);
// Selling prices at a branch (Manila's include freight) are prices, so employees see them; the
// freight cost behind them is not.
const EMPLOYEE_SETTING_PREFIXES = ["shelfLifeDays:", "eventPlan:", "seasonality:", "branchPrice:"];

/** Settings an employee may change: marking a day off on the production calendar. */
const EMPLOYEE_WRITABLE_SETTING_KEYS = new Set(["unavailableDays"]);

/**
 * What a non-Executive may see and record. The Admin (Ruchel) works out and pays salaries, so the
 * salary expenses are hers too; an employee never sees them.
 */
export function canSeeEntry(role: Role, entry: Pick<Entry, "type"> & { category?: string | null }): boolean {
  if (role === "executive") return true;
  if (role === "admin") return EMPLOYEE_ENTRY_TYPES.includes(entry.type);
  return employeeCanSeeEntry(entry);
}

export function employeeCanSeeEntry(entry: Pick<Entry, "type"> & { category?: string | null }): boolean {
  return EMPLOYEE_ENTRY_TYPES.includes(entry.type) && !isPayroll({ type: entry.type, category: entry.category ?? null });
}

export function employeeCanSeeSetting(key: string): boolean {
  return EMPLOYEE_SETTING_KEYS.has(key) || EMPLOYEE_SETTING_PREFIXES.some((p) => key.startsWith(p));
}

/** Everything /api/business-data serves, as the sheet holds it. */
export interface BusinessData {
  entries: Entry[];
  products: ProductRow[];
  recipes: RecipeRow[];
  rawMaterials: RawMaterialStock[];
  suppliers: unknown[];
  supplierPriceHistory: unknown[];
  budgets: unknown[];
  events: unknown[];
  eventStock: unknown[];
  machines: unknown[];
  supplierPrices: unknown[];
  businessSettings: { key: string; value: string }[];
  users: unknown[];
  activity: ActivityEvent[];
  staff: StaffMember[];
  timeRecords: TimeRecord[];
  payroll: PayrollRecord[];
  /** Already narrowed to what the signed-in person may see (see visibleCalendarItems). */
  calendarItems: CalendarItem[];
  stockTransfers: StockTransfer[];
  tingi: TingiMove[];
  productionRuns: ProductionRun[];
}

/**
 * The calendar items one person sees: their own, ones shared with everyone, and ones shared with
 * them. Private means private — an Executive doesn't see an employee's private items either.
 */
export function visibleCalendarItems(items: CalendarItem[], userId: string): CalendarItem[] {
  return items.filter((c) => c.ownerId === userId || c.visibility === "everyone" || (c.visibility === "people" && c.sharedWith.includes(userId)));
}

/** Calendar items: anyone adds their own; only the owner changes or deletes one. Same for every role. */
function decideCalendarItem(req: WriteRequest): WriteDecision {
  const { op, item, existing, user } = req;
  if (op === "migrate") return deny("forbidden");
  if (op === "append") {
    if (!item) return deny("forbidden");
    return { allow: true, item: { ...item, ownerId: user.id, ownerName: user.name } };
  }
  if (!existing) return deny("forbidden");
  if (existing.ownerId !== user.id) return deny("not_your_calendar_item");
  if (op === "delete") return { allow: true };
  return { allow: true, item: { ...item, ownerId: existing.ownerId, ownerName: existing.ownerName, createdAt: existing.createdAt } };
}

/**
 * The data an employee's device receives. `sellingPrice` is each product's price as worked out
 * on the server — a cost- or margin-based price can't be recomputed without the costs, so the
 * employee copy carries the answer as a fixed price instead of the recipe for it.
 */
export function redactForEmployee(data: BusinessData, sellingPrice: (product: ProductRow) => number, userId?: string, role: Role = "employee"): BusinessData {
  // The Admin (the main computer) times everyone in and out, so sees every name and time; an
  // employee sees only their own day records (their leave on the calendar), never anyone else's.
  const keeper = role === "admin";
  const own = data.staff.filter((s) => s.active && (keeper || (userId && s.userId === userId)));
  const ownIds = new Set(own.map((s) => s.id));
  return {
    ...data,
    entries: data.entries
      .filter((e) => canSeeEntry(role, e))
      // Spoilage is valued at cost, so its amount is a cost.
      .map((e) => (e.type === "WASTE" ? { ...e, amount: null } : e))
      // Who still owes the business what is the owners' to track, not the counter's.
      .map(withoutPaymentFields),
    products: data.products.map((p) => ({
      ...p,
      standardPrice: sellingPrice(p),
      pricingMode: "manual",
      marginPercent: 0,
      marketPrice: 0,
      laborCostOverride: null,
    })),
    // Ingredient rows say what a batch uses (production needs that); labor and misc rows are
    // only ever costs.
    // In-house components (tablea in ice cream) are quantities too, which production planning needs.
    recipes: data.recipes.filter((r) => r.rowType === "ingredient" || r.rowType === "component").map((r) => ({ ...r, cost: null })),
    rawMaterials: data.rawMaterials.map((m) => ({ ...m, unitCost: 0 })),
    suppliers: [],
    supplierPriceHistory: [],
    budgets: [],
    supplierPrices: [],
    businessSettings: data.businessSettings.filter((s) => employeeCanSeeSetting(s.key)),
    activity: [],
    // The Admin works out salaries, so has the staff list with rates, everyone's days and the
    // payslips. An employee gets only their own name — never a rate or anything else about pay.
    staff: keeper ? data.staff : own.map(staffNameOnly),
    timeRecords: keeper ? data.timeRecords : data.timeRecords.filter((r) => ownIds.has(r.staffId)),
    payroll: keeper ? data.payroll : [],
  };
}

function staffNameOnly(s: StaffMember): StaffMember {
  return { id: s.id, name: s.name, payType: "daily", rate: 0, position: "", pwd: false, userId: s.userId, startDate: null, active: s.active, allowanceOnly: false, createdAt: s.createdAt };
}

/**
 * The days an employee may put in or fix their own times for, in Manila: every day of the
 * current pay period up to today (a forgotten time in), and yesterday (a shift past midnight,
 * or the day before a new period). Never the future, never an earlier, settled period.
 */
export function employeeTimeDays(now: Date): string[] {
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const yesterday = new Date(now.getTime() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const period = daysIn({ start: periodFor(today).start, end: today });
  return [...new Set([...period, yesterday])];
}

export interface WriteRequest {
  role: Role;
  /** Who is signed in — stamped onto what they record, whatever the browser sent. */
  user: { id: string; name: string };
  collection: CollectionName;
  op: WriteOp;
  item?: Record<string, unknown>;
  /** The row as the sheet holds it now, for update/delete. Undefined if it isn't there. */
  existing?: Record<string, unknown>;
  /** For tests; the server's clock otherwise. */
  now?: Date;
  /** The staff members this profile times in as (timeRecords writes by employees). */
  ownStaffIds?: string[];
}

export type WriteDecision = { allow: true; item?: Record<string, unknown> } | { allow: false; reason: string };

const deny = (reason: string): WriteDecision => ({ allow: false, reason });

/** Collections whose update/delete decision depends on the row already in the sheet. */
export function needsExistingRow(role: Role, collection: CollectionName, op: WriteOp): boolean {
  if (collection === "calendarItems") return op === "update" || op === "delete";
  return role !== "executive" && (op === "update" || op === "delete") && ["entries", "products", "rawMaterials", "timeRecords"].includes(collection);
}

function stamp(req: WriteRequest): Record<string, unknown> | undefined {
  if (!req.item) return req.item;
  if (req.collection === "entries" && req.op === "append") {
    return { ...req.item, loggedById: req.user.id, loggedByName: req.user.name };
  }
  if (req.collection === "timeRecords" && (req.op === "append" || req.op === "update")) {
    return { ...req.item, loggedById: req.user.id, loggedByName: req.user.name };
  }
  if (req.collection === "activity" && req.op === "append") {
    return { ...req.item, userId: req.user.id, userName: req.user.name };
  }
  return req.item;
}

export function decideWrite(req: WriteRequest): WriteDecision {
  // Profiles go through /api/auth/profiles, which hashes PINs and checks who may add whom.
  if (req.collection === "users") return deny("use_profiles_api");

  // The same rules for everyone: payments can't exceed what was owed, a receivable is a sale,
  // a bank transfer names its bank. A screen that forgets one of these can't corrupt the ledger.
  if (req.collection === "entries" && (req.op === "append" || req.op === "update") && req.item) {
    const problem = entryIntegrityProblem(req.item as Partial<Entry>);
    if (problem) return deny(problem);
  }

  if (req.collection === "calendarItems") return decideCalendarItem(req);

  if (req.role === "executive") return { allow: true, item: stamp(req) };

  const { collection, op, item, existing } = req;
  if (op === "migrate") return deny("forbidden");

  switch (collection) {
    case "entries": {
      if (op === "append") {
        if (!item || !canSeeEntry(req.role, item as Pick<Entry, "type" | "category">)) return deny("forbidden_entry_type");
        // Payment terms are the owners' to set: an employee's sale or expense is recorded as
        // paid on the spot, never as a payable or receivable.
        return { allow: true, item: withoutPaymentFields(stamp(req) ?? {}) };
      }
      // An employee can only touch entries they could see, and can't turn one into payroll.
      if (!existing || !canSeeEntry(req.role, existing as Pick<Entry, "type" | "category">)) return deny("forbidden");
      if (op === "delete") return { allow: true };
      if (!item || !canSeeEntry(req.role, item as Pick<Entry, "type" | "category">)) return deny("forbidden_entry_type");
      // Their copy of a spoilage entry has no amount (it's a cost); keep the real one.
      const merged = existing.type === "WASTE" && item.type === "WASTE" ? { ...item, amount: existing.amount } : item;
      // Who logged it isn't theirs to change, and their copy has no payment terms — keep the
      // real ones, or editing a sale on credit would quietly mark it paid.
      const kept = Object.fromEntries(PAYMENT_FIELDS.map((f) => [f, existing[f]]));
      return { allow: true, item: { ...merged, ...kept, loggedById: existing.loggedById, loggedByName: existing.loggedByName } };
    }
    case "products":
    case "rawMaterials": {
      // Logging a sale or a batch moves stock, and the app saves stock by rewriting the whole
      // row. The employee's copy of that row has its costs and pricing blanked, so only the
      // stock figure is taken from it — anything else would overwrite real costs with blanks.
      if (op !== "update" || !item || !existing) return deny("forbidden");
      const field = collection === "products" ? "stockQty" : "qty";
      return { allow: true, item: { ...existing, [field]: item[field] } };
    }
    case "events":
    case "eventStock":
      return { allow: true };
    case "tingi":
    case "payroll":
      // The Admin records and takes back salary payments; anyone else, no.
      return req.role === "admin" && (op === "append" || op === "delete") ? { allow: true } : deny("forbidden");
    case "stockTransfers":
    case "productionRuns":
      // Moving stock between branches, in and out of a tingi bucket, and logging a
      // production run are everyday work; taking one back is an Executive's.
      return op === "append" && item ? { allow: true, item: { ...item, loggedByName: req.user.name } } : deny("forbidden");
    case "businessSettings":
      return op === "update" && item && EMPLOYEE_WRITABLE_SETTING_KEYS.has(String(item.key))
        ? { allow: true }
        : deny("forbidden");
    case "activity":
      return op === "append" ? { allow: true, item: stamp(req) } : deny("forbidden");
    case "timeRecords": {
      // Time in and out happens on the Admin profile only — the main computer — for this pay
      // period, and only the clock times. Whether a day counts, and overtime, are an
      // Executive's to set. Employees can't time anyone in, themselves included.
      if (req.role !== "admin") return deny("time_in_is_admin_only");
      if (op !== "append" && op !== "update") return deny("forbidden");
      if (!item) return deny("forbidden");
      const mine = req.ownStaffIds ?? [];
      if (!mine.includes(String(item.staffId)) || (existing && !mine.includes(String(existing.staffId)))) return deny("not_your_time_record");
      const days = employeeTimeDays(req.now ?? new Date());
      if (!days.includes(String(item.date))) return deny("time_record_too_old");
      if (op === "update" && (!existing || !days.includes(String(existing.date)) || existing.staffId !== item.staffId)) return deny("forbidden");
      const clock = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v) ? v : null);
      const stamped = stamp(req) ?? {};
      return {
        allow: true,
        item: {
          ...(existing ?? {}),
          id: item.id,
          staffId: item.staffId,
          date: item.date,
          timeIn: clock(item.timeIn),
          timeOut: clock(item.timeOut),
          breakStart: clock(item.breakStart),
          breakEnd: clock(item.breakEnd),
          // The Admin works out pay, so marks absences, half days, leave and days off; overtime
          // (money on top) is still an Executive's to approve.
          status: ["present", "half", "absent", "off", "leave"].includes(String(item.status)) ? item.status : (existing?.status ?? "present"),
          otHours: existing?.otHours ?? 0,
          note: typeof item.note === "string" ? item.note.slice(0, 200) : "",
          loggedById: stamped.loggedById,
          loggedByName: stamped.loggedByName,
          createdAt: existing?.createdAt ?? item.createdAt ?? new Date().toISOString(),
        },
      };
    }
    default:
      return deny("forbidden");
  }
}
