import type { ActivityEvent, Entry, EntryType, RawMaterialStock, Role } from "@/lib/store/types";
import type { ProductRow, RecipeRow } from "@/lib/store/sheet-shapes";

/**
 * What each role may read and write — the one place that decides it, run on the server by
 * /api/business-data. Pure functions over plain rows, so the rules can be tested without a
 * spreadsheet (permissions.test.ts).
 *
 * Executives see and change everything. Employees log sales, spoilage, batches and event
 * stock, and see stock levels and selling prices — but never a cost, a margin, R&D, an expense
 * (payroll lives there), a supplier price, a budget, or the change log (whose "before" copies
 * would leak all of the above).
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
  | "activity";

export type WriteOp = "append" | "update" | "delete" | "migrate";

/** Entry types an employee can see and record. Everything else is money out or owner-only. */
export const EMPLOYEE_ENTRY_TYPES: readonly EntryType[] = ["SALE", "WASTE", "INVENTORY_IN", "INVENTORY_OUT", "NOTE"];

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

export function employeeCanSeeEntry(entry: Pick<Entry, "type">): boolean {
  return EMPLOYEE_ENTRY_TYPES.includes(entry.type);
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
      .map((e) => (e.type === "WASTE" ? { ...e, amount: null } : e)),
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
    recipes: data.recipes.filter((r) => r.rowType === "ingredient").map((r) => ({ ...r, cost: null })),
    rawMaterials: data.rawMaterials.map((m) => ({ ...m, unitCost: 0 })),
    suppliers: [],
    supplierPriceHistory: [],
    budgets: [],
    supplierPrices: [],
    businessSettings: data.businessSettings.filter((s) => employeeCanSeeSetting(s.key)),
    activity: [],
  };
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
}

export type WriteDecision = { allow: true; item?: Record<string, unknown> } | { allow: false; reason: string };

const deny = (reason: string): WriteDecision => ({ allow: false, reason });

/** Collections whose update/delete decision depends on the row already in the sheet. */
export function needsExistingRow(role: Role, collection: CollectionName, op: WriteOp): boolean {
  return role === "employee" && (op === "update" || op === "delete") && ["entries", "products", "rawMaterials"].includes(collection);
}

function stamp(req: WriteRequest): Record<string, unknown> | undefined {
  if (!req.item) return req.item;
  if (req.collection === "entries" && req.op === "append") {
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

  if (req.role === "executive") return { allow: true, item: stamp(req) };

  const { collection, op, item, existing } = req;
  if (op === "migrate") return deny("forbidden");

  switch (collection) {
    case "entries": {
      if (op === "append") {
        if (!item || !employeeCanSeeEntry(item as Pick<Entry, "type">)) return deny("forbidden_entry_type");
        return { allow: true, item: stamp(req) };
      }
      // An employee can only touch entries they could see, and can't turn one into an expense.
      if (!existing || !employeeCanSeeEntry(existing as Pick<Entry, "type">)) return deny("forbidden");
      if (op === "delete") return { allow: true };
      if (!item || !employeeCanSeeEntry(item as Pick<Entry, "type">)) return deny("forbidden_entry_type");
      // Their copy of a spoilage entry has no amount (it's a cost); keep the real one.
      const merged = existing.type === "WASTE" && item.type === "WASTE" ? { ...item, amount: existing.amount } : item;
      // Who logged it isn't theirs to change.
      return { allow: true, item: { ...merged, loggedById: existing.loggedById, loggedByName: existing.loggedByName } };
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
    default:
      return deny("forbidden");
  }
}
