import type { ActivityEvent, Entry, EntryType, PayrollRecord, RawMaterialStock, Role, StaffMember, TimeRecord } from "@/lib/store/types";
import type { ProductRow, RecipeRow } from "@/lib/store/sheet-shapes";
import { entryIntegrityProblem } from "@/lib/transactions/ledger";

/**
 * What each role may read and write — the one place that decides it, run on the server by
 * /api/business-data. Pure functions over plain rows, so the rules can be tested without a
 * spreadsheet (permissions.test.ts).
 *
 * Executives see and change everything. Employees log sales, spoilage, batches and event
 * stock, and see stock levels and selling prices — but never a cost, a margin, R&D, an expense
 * (payroll lives there), a supplier price, a budget, or the change log (whose "before" copies
 * would leak all of the above). They time themselves in and out, and see staff names — never
 * a rate or a payslip.
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
  | "payroll";

export type WriteOp = "append" | "update" | "delete" | "migrate";

/** Payment terms on a sale — who owes what, and when. Executives only; see redactForEmployee. */
const PAYMENT_FIELDS = ["paymentTerm", "dueDate", "amountPaid", "paymentStatus", "settledAt", "paymentMethod", "bankName", "payments", "paymentTerms", "dueDateHistory", "defaultedAt"] as const;

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
]);
const EMPLOYEE_SETTING_PREFIXES = ["shelfLifeDays:", "eventPlan:", "seasonality:"];

/** Settings an employee may change: marking a day off on the production calendar. */
const EMPLOYEE_WRITABLE_SETTING_KEYS = new Set(["unavailableDays"]);

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
}

/**
 * The data an employee's device receives. `sellingPrice` is each product's price as worked out
 * on the server — a cost- or margin-based price can't be recomputed without the costs, so the
 * employee copy carries the answer as a fixed price instead of the recipe for it.
 */
export function redactForEmployee(data: BusinessData, sellingPrice: (product: ProductRow) => number): BusinessData {
  return {
    ...data,
    entries: data.entries
      .filter(employeeCanSeeEntry)
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
    // Names, so they can time in — never a rate, a pay type or anything else about pay.
    staff: data.staff.filter((s) => s.active).map(staffNameOnly),
    timeRecords: data.timeRecords,
    payroll: [],
  };
}

function staffNameOnly(s: StaffMember): StaffMember {
  return { id: s.id, name: s.name, payType: "daily", rate: 0, position: "", pwd: false, userId: s.userId, startDate: null, active: s.active, allowanceOnly: false, createdAt: s.createdAt };
}

/** The days an employee may time in or out on: today and yesterday (a shift past midnight), in Manila. */
export function employeeTimeDays(now: Date): string[] {
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const yesterday = new Date(now.getTime() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  return [today, yesterday];
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
}

export type WriteDecision = { allow: true; item?: Record<string, unknown> } | { allow: false; reason: string };

const deny = (reason: string): WriteDecision => ({ allow: false, reason });

/** Collections whose update/delete decision depends on the row already in the sheet. */
export function needsExistingRow(role: Role, collection: CollectionName, op: WriteOp): boolean {
  return role === "employee" && (op === "update" || op === "delete") && ["entries", "products", "rawMaterials", "timeRecords"].includes(collection);
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

  if (req.role === "executive") return { allow: true, item: stamp(req) };

  const { collection, op, item, existing } = req;
  if (op === "migrate") return deny("forbidden");

  switch (collection) {
    case "entries": {
      if (op === "append") {
        if (!item || !employeeCanSeeEntry(item as Pick<Entry, "type" | "category">)) return deny("forbidden_entry_type");
        // Payment terms are the owners' to set: an employee's sale or expense is recorded as
        // paid on the spot, never as a payable or receivable.
        return { allow: true, item: withoutPaymentFields(stamp(req) ?? {}) };
      }
      // An employee can only touch entries they could see, and can't turn one into payroll.
      if (!existing || !employeeCanSeeEntry(existing as Pick<Entry, "type" | "category">)) return deny("forbidden");
      if (op === "delete") return { allow: true };
      if (!item || !employeeCanSeeEntry(item as Pick<Entry, "type" | "category">)) return deny("forbidden_entry_type");
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
    case "businessSettings":
      return op === "update" && item && EMPLOYEE_WRITABLE_SETTING_KEYS.has(String(item.key))
        ? { allow: true }
        : deny("forbidden");
    case "activity":
      return op === "append" ? { allow: true, item: stamp(req) } : deny("forbidden");
    case "timeRecords": {
      // Staff time themselves in and out — today (or last night's shift), nothing earlier, and
      // only the clock times. Whether a day counts, and overtime, are an Executive's to set.
      if (op !== "append" && op !== "update") return deny("forbidden");
      if (!item) return deny("forbidden");
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
          status: existing?.status ?? "present",
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
