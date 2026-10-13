import { test } from "node:test";
import assert from "node:assert/strict";
import { decideWrite, redactForEmployee, type BusinessData } from "./permissions.ts";

// Role gating: what an employee's device receives, and what the server lets an employee save.
// Run with `npm test`.

const me = { id: "u-emp", name: "Kuya Jun" };

function sample(): BusinessData {
  return {
    entries: [
      { id: "s1", type: "SALE", amount: 1500, sku: "Tablea" },
      { id: "x1", type: "EXPENSE", amount: 4598.45, sku: "sweldo khent", category: "labor" },
      { id: "r1", type: "RND", amount: 900, sku: "trial" },
      { id: "w1", type: "WASTE", amount: 120, sku: "Tablea" },
    ] as never,
    products: [{ id: "p1", name: "Tablea", standardPrice: 100, pricingMode: "cost_percent", marginPercent: 60, marketPrice: 90, laborCostOverride: 12, stockQty: 40 }] as never,
    recipes: [
      { id: "r-i", productId: "p1", rowType: "ingredient", materialId: "m1", label: null, quantity: 2, cost: null },
      { id: "r-l", productId: "p1", rowType: "labor", materialId: null, label: "roasting", quantity: null, cost: 50 },
    ],
    rawMaterials: [{ id: "m1", name: "Cacao beans", unit: "kg", qty: 100, unitCost: 300 }] as never,
    suppliers: [{ id: "sup" }],
    supplierPriceHistory: [{ id: "h" }],
    budgets: [{ category: "labor", monthlyBudget: 800 }],
    events: [{ id: "e1" }],
    eventStock: [],
    machines: [{ id: "mc" }],
    supplierPrices: [{ id: "sp" }],
    businessSettings: [
      { key: "hourly_labor_rate", value: "80" },
      { key: "salesTargetMonthly", value: "90000" },
      { key: "expiringWithinDays", value: "7" },
      { key: "shelfLifeDays:p1", value: "90" },
    ],
    users: [],
    activity: [{ id: "a1" }] as never,
  };
}

test("employee copy hides expenses, R&D, payroll and spoilage cost", () => {
  const out = redactForEmployee(sample(), () => 160);
  assert.deepEqual(out.entries.map((e) => e.id), ["s1", "w1"]);
  assert.equal(out.entries.find((e) => e.id === "w1")?.amount, null);
  assert.equal(out.entries.find((e) => e.id === "s1")?.amount, 1500);
});

test("employee copy carries the selling price but no way to work out cost or margin", () => {
  const [p] = redactForEmployee(sample(), () => 160).products;
  assert.equal(p.standardPrice, 160);
  assert.equal(p.pricingMode, "manual");
  assert.equal(p.marginPercent, 0);
  assert.equal(p.laborCostOverride, null);
  assert.equal(p.stockQty, 40);
});

test("employee copy drops cost-only collections and settings", () => {
  const out = redactForEmployee(sample(), () => 160);
  assert.deepEqual(out.recipes.map((r) => r.id), ["r-i"]);
  assert.equal(out.rawMaterials[0].unitCost, 0);
  assert.equal(out.rawMaterials[0].qty, 100);
  for (const key of ["suppliers", "supplierPriceHistory", "budgets", "supplierPrices", "activity"] as const) {
    assert.equal(out[key].length, 0, key);
  }
  assert.deepEqual(out.businessSettings.map((s) => s.key), ["expiringWithinDays", "shelfLifeDays:p1"]);
  assert.equal(out.events.length, 1);
});

test("employee can log a sale, stamped with their own name", () => {
  const d = decideWrite({ role: "employee", user: me, collection: "entries", op: "append", item: { type: "SALE", loggedByName: "Owner" } });
  assert.ok(d.allow);
  assert.equal(d.allow && d.item?.loggedByName, "Kuya Jun");
  assert.equal(d.allow && d.item?.loggedById, "u-emp");
});

test("employee cannot log or edit expenses or R&D", () => {
  for (const type of ["EXPENSE", "RND", "SUPPLIER"]) {
    assert.equal(decideWrite({ role: "employee", user: me, collection: "entries", op: "append", item: { type } }).allow, false, type);
  }
  const editExpense = decideWrite({ role: "employee", user: me, collection: "entries", op: "update", item: { type: "SALE" }, existing: { type: "EXPENSE" } });
  assert.equal(editExpense.allow, false);
  const turnIntoExpense = decideWrite({ role: "employee", user: me, collection: "entries", op: "update", item: { type: "EXPENSE" }, existing: { type: "SALE" } });
  assert.equal(turnIntoExpense.allow, false);
  const deleteExpense = decideWrite({ role: "employee", user: me, collection: "entries", op: "delete", existing: { type: "EXPENSE" } });
  assert.equal(deleteExpense.allow, false);
});

test("employee editing spoilage keeps its real cost and original logger", () => {
  const d = decideWrite({
    role: "employee",
    user: me,
    collection: "entries",
    op: "update",
    item: { type: "WASTE", amount: null, quantity: 3, loggedByName: "Kuya Jun" },
    existing: { type: "WASTE", amount: 120, quantity: 2, loggedByName: "Owner", loggedById: "u-own" },
  });
  assert.ok(d.allow);
  assert.equal(d.allow && d.item?.amount, 120);
  assert.equal(d.allow && d.item?.quantity, 3);
  assert.equal(d.allow && d.item?.loggedByName, "Owner");
});

test("an employee's stock update changes only the stock figure", () => {
  const existing = { id: "p1", standardPrice: 100, pricingMode: "cost_percent", marginPercent: 60, stockQty: 40 };
  const d = decideWrite({
    role: "employee",
    user: me,
    collection: "products",
    op: "update",
    item: { id: "p1", standardPrice: 160, pricingMode: "manual", marginPercent: 0, stockQty: 37 },
    existing,
  });
  assert.ok(d.allow);
  assert.deepEqual(d.allow && d.item, { ...existing, stockQty: 37 });

  const m = decideWrite({ role: "employee", user: me, collection: "rawMaterials", op: "update", item: { qty: 90, unitCost: 0 }, existing: { qty: 100, unitCost: 300 } });
  assert.deepEqual(m.allow && m.item, { qty: 90, unitCost: 300 });
});

test("employee cannot add or remove products, touch costing data, budgets or seed the sheet", () => {
  const no = (collection: Parameters<typeof decideWrite>[0]["collection"], op: Parameters<typeof decideWrite>[0]["op"]) =>
    assert.equal(decideWrite({ role: "employee", user: me, collection, op, item: {}, existing: {} }).allow, false, `${collection} ${op}`);
  no("products", "append");
  no("products", "delete");
  no("recipes", "update");
  no("suppliers", "append");
  no("supplierPrices", "append");
  no("budgets", "update");
  no("machines", "update");
  no("entries", "migrate");
  no("activity", "update");
  assert.equal(decideWrite({ role: "employee", user: me, collection: "businessSettings", op: "update", item: { key: "hourly_labor_rate" } }).allow, false);
  assert.equal(decideWrite({ role: "employee", user: me, collection: "businessSettings", op: "update", item: { key: "unavailableDays" } }).allow, true);
});

test("nobody writes profiles as raw rows — PINs go through the profiles API", () => {
  for (const role of ["executive", "employee"] as const) {
    assert.equal(decideWrite({ role, user: me, collection: "users", op: "update", item: {} }).allow, false);
  }
});

test("executive can write anything else, and the logger is still stamped from the session", () => {
  const d = decideWrite({ role: "executive", user: { id: "u-own", name: "Owner" }, collection: "entries", op: "append", item: { type: "EXPENSE", loggedByName: "Someone else" } });
  assert.ok(d.allow);
  assert.equal(d.allow && d.item?.loggedByName, "Owner");
  assert.ok(decideWrite({ role: "executive", user: me, collection: "budgets", op: "update", item: {} }).allow);
});
