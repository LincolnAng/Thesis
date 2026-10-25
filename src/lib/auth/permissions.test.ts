import { test } from "node:test";
import assert from "node:assert/strict";
import { decideWrite, redactForEmployee, visibleCalendarItems, type BusinessData } from "./permissions.ts";

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
    staff: [
      { id: "st1", name: "Khent", payType: "monthly", rate: 25000, position: "Production", pwd: false, userId: null, startDate: "2026-01-01", active: true, allowanceOnly: false, createdAt: "" },
      { id: "st2", name: "Old", payType: "daily", rate: 500, position: "", pwd: false, userId: null, startDate: null, active: false, allowanceOnly: false, createdAt: "" },
    ],
    timeRecords: [{ id: "t1", staffId: "st1", date: "2026-10-21", timeIn: "08:00", timeOut: "17:00", status: "present", otHours: 0, note: "", createdAt: "" }],
    calendarItems: [],
    stockTransfers: [],
    payroll: [{ id: "pay1", staffId: "st1", kind: "regular", periodStart: "2026-10-01", periodEnd: "2026-10-15", basic: 12500, overtime: 0, deductions: 0, deductionNote: "", net: 12500, paidOn: "2026-10-15", entryId: null, createdAt: "", sss: 0, philhealth: 0, pagibig: 0 }],
  };
}

test("employee copy shows everyday expenses but hides payroll, R&D and spoilage cost", () => {
  const out = redactForEmployee(sample(), () => 160);
  assert.deepEqual(out.entries.map((e) => e.id), ["s1", "w1"]); // the only expense in the sample is payroll
  assert.equal(out.entries.find((e) => e.id === "w1")?.amount, null);
  assert.equal(out.entries.find((e) => e.id === "s1")?.amount, 1500);
  const withSupplies = { ...sample(), entries: [...sample().entries, { id: "x2", type: "EXPENSE", amount: 120, sku: "Fare", category: "transport" }] as never };
  assert.ok(redactForEmployee(withSupplies, () => 160).entries.some((e) => e.id === "x2"));
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

test("employee can log an everyday expense, recorded as paid on the spot, but not payroll or R&D", () => {
  const ok = decideWrite({ role: "employee", user: me, collection: "entries", op: "append", item: { type: "EXPENSE", category: "transport", paymentTerm: "payable", dueDate: "2026-11-01" } });
  assert.ok(ok.allow);
  assert.equal(ok.allow && ok.item?.paymentTerm, undefined);
  for (const item of [{ type: "EXPENSE", category: "labor" }, { type: "EXPENSE", category: "Payroll" }, { type: "RND" }, { type: "SUPPLIER" }, { type: "CAPITAL" }, { type: "ASSET" }]) {
    assert.equal(decideWrite({ role: "employee", user: me, collection: "entries", op: "append", item }).allow, false, JSON.stringify(item));
  }
  const editPayroll = decideWrite({ role: "employee", user: me, collection: "entries", op: "update", item: { type: "EXPENSE", category: "transport" }, existing: { type: "EXPENSE", category: "labor" } });
  assert.equal(editPayroll.allow, false);
  const turnIntoPayroll = decideWrite({ role: "employee", user: me, collection: "entries", op: "update", item: { type: "EXPENSE", category: "labor" }, existing: { type: "EXPENSE", category: "transport" } });
  assert.equal(turnIntoPayroll.allow, false);
  const deleteRnd = decideWrite({ role: "employee", user: me, collection: "entries", op: "delete", existing: { type: "RND" } });
  assert.equal(deleteRnd.allow, false);
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

test("employees never receive payment terms, and editing a sale keeps them", () => {
  const data = sample();
  data.entries = [
    { id: "s2", type: "SALE", amount: 2000, sku: "Tablea", paymentTerm: "receivable", amountPaid: 500, dueDate: "2026-11-01", paymentStatus: "partial" },
  ] as never;
  const [sale] = redactForEmployee(data, () => 100).entries as unknown as Record<string, unknown>[];
  for (const f of ["paymentTerm", "dueDate", "amountPaid", "paymentStatus", "settledAt"]) assert.ok(!(f in sale), f);

  const existing = { id: "s2", type: "SALE", amount: 2000, paymentTerm: "receivable", amountPaid: 500, dueDate: "2026-11-01", paymentStatus: "partial", loggedById: "u-exec", loggedByName: "Ate" };
  const decision = decideWrite({
    role: "employee",
    user: me,
    collection: "entries",
    op: "update",
    item: { id: "s2", type: "SALE", amount: 2000, quantity: 20 },
    existing,
  });
  assert.equal(decision.allow, true);
  const item = (decision as { item: Record<string, unknown> }).item;
  assert.equal(item.paymentTerm, "receivable");
  assert.equal(item.amountPaid, 500);
  assert.equal(item.quantity, 20);
});

test("employees keep in-house component rows (production needs them), without costs", () => {
  const data = sample();
  data.recipes = [...data.recipes, { id: "r-c", productId: "p1", rowType: "component", materialId: "p-tablea", label: null, quantity: 3, cost: 12 }];
  const recipes = redactForEmployee(data, () => 100).recipes;
  const component = recipes.find((r) => r.rowType === "component");
  assert.ok(component);
  assert.equal(component.cost, null);
  assert.ok(!recipes.some((r) => r.rowType === "labor"));
});

test("every role is held to the ledger's integrity rules on the server", () => {
  const bad = { id: "s9", type: "SALE", amount: 1000, paymentTerm: "receivable", payments: [{ id: "p", date: "2026-10-10", amount: 1500, method: "cash", bankName: null, note: null }] };
  for (const role of ["executive", "employee"] as const) {
    const decision = decideWrite({ role, user: me, collection: "entries", op: "append", item: bad });
    assert.equal(decision.allow, false, role);
  }
  const ok = decideWrite({ role: "executive", user: me, collection: "entries", op: "append", item: { id: "s10", type: "SALE", amount: 1000, paymentTerm: "receivable" } });
  assert.equal(ok.allow, true);
});

test("employees never receive payment history, defaults or deadline changes", () => {
  const data = sample();
  data.entries = [
    { id: "s3", type: "SALE", amount: 900, paymentTerm: "receivable", paymentTerms: "net_30", payments: [{ id: "p", date: "2026-10-10", amount: 100, method: "cash", bankName: null, note: null }], defaultedAt: "2026-10-12T00:00:00Z", dueDateHistory: [{ from: null, to: "2026-10-30", changedAt: "2026-10-01T00:00:00Z" }] },
  ] as never;
  const [sale] = redactForEmployee(data, () => 100).entries as unknown as Record<string, unknown>[];
  for (const f of ["payments", "defaultedAt", "dueDateHistory", "paymentTerms"]) assert.ok(!(f in sale), f);
});

test("an employee sees only their own name and times — no one else's, no rates, no payslips", () => {
  const data = sample();
  data.staff.push({ id: "st3", name: "Shiela", payType: "daily", rate: 500, position: "", pwd: false, userId: "u-emp", startDate: null, active: true, allowanceOnly: false, createdAt: "" });
  data.timeRecords.push({ id: "t2", staffId: "st3", date: "2026-10-21", timeIn: "08:10", timeOut: null, status: "present", otHours: 0, note: "", createdAt: "" });
  const out = redactForEmployee(data, (p) => p.standardPrice, "u-emp");
  assert.deepEqual(out.staff.map((x) => [x.name, x.rate]), [["Shiela", 0]]);
  assert.deepEqual(out.timeRecords.map((r) => r.id), ["t2"]);
  assert.deepEqual(out.payroll, []);
  // A profile not linked to anyone sees no one.
  const other = redactForEmployee(data, (p) => p.standardPrice, "u-other");
  assert.equal(other.staff.length + other.timeRecords.length, 0);
});

test("employees put in and fix only their own times, this pay period only, and can't set pay-related fields", () => {
  const now = new Date("2026-10-22T02:00:00Z"); // 10 AM in Manila
  const base = { role: "employee" as const, user: me, collection: "timeRecords" as const, now, ownStaffIds: ["st1"] };
  const ok = decideWrite({ ...base, op: "append", item: { id: "t9", staffId: "st1", date: "2026-10-22", timeIn: "08:03", status: "absent", otHours: 9 } });
  assert.ok(ok.allow);
  assert.equal(ok.allow && ok.item?.status, "present");
  assert.equal(ok.allow && ok.item?.otHours, 0);
  assert.equal(ok.allow && ok.item?.loggedByName, "Kuya Jun");
  // A forgotten day earlier this period is fine; last period, the future and someone else are not.
  assert.ok(decideWrite({ ...base, op: "append", item: { id: "t7", staffId: "st1", date: "2026-10-17", timeIn: "08:00", timeOut: "17:00" } }).allow);
  assert.equal(decideWrite({ ...base, op: "append", item: { id: "t8", staffId: "st1", date: "2026-10-10", timeIn: "08:00" } }).allow, false);
  assert.equal(decideWrite({ ...base, op: "append", item: { id: "t6", staffId: "st1", date: "2026-10-23", timeIn: "08:00" } }).allow, false);
  assert.equal(decideWrite({ ...base, op: "append", item: { id: "t5", staffId: "st2", date: "2026-10-22", timeIn: "08:00" } }).allow, false);
  const theirs = { id: "t4", staffId: "st2", date: "2026-10-22", timeIn: "08:00", timeOut: null, status: "present", otHours: 0, createdAt: "x" };
  assert.equal(decideWrite({ ...base, op: "update", item: { ...theirs, staffId: "st1" }, existing: theirs }).allow, false);

  const existing = { id: "t9", staffId: "st1", date: "2026-10-22", timeIn: "08:03", timeOut: null, status: "half", otHours: 1, createdAt: "x" };
  const out = decideWrite({ ...base, op: "update", item: { ...existing, timeOut: "17:10", status: "present", otHours: 5 }, existing });
  assert.ok(out.allow);
  assert.equal(out.allow && out.item?.timeOut, "17:10");
  assert.equal(out.allow && out.item?.status, "half");
  assert.equal(out.allow && out.item?.otHours, 1);
  assert.equal(decideWrite({ ...base, op: "delete", id: "t9", existing } as never).allow, false);
  for (const collection of ["staff", "payroll"] as const) {
    assert.equal(decideWrite({ role: "employee", user: me, collection, op: "append", item: { id: "x" } }).allow, false, collection);
  }
});

test("a timekeeper sees and records everyone's times (names only); others still see only their own", () => {
  const data = sample();
  data.staff.push({ id: "st4", name: "Dadoy", payType: "daily", rate: 525, position: "", pwd: true, userId: null, startDate: null, active: true, allowanceOnly: false, createdAt: "" });
  data.businessSettings.push({ key: "timekeepers", value: "u-ruchel" });
  const keeper = redactForEmployee(data, (p) => p.standardPrice, "u-ruchel");
  assert.deepEqual(keeper.staff.map((s) => [s.name, s.rate, s.pwd]).sort(), [["Dadoy", 0, false], ["Khent", 0, false]]);
  assert.equal(keeper.timeRecords.length, 1);
  assert.ok(keeper.businessSettings.some((s) => s.key === "timekeepers"));
  const other = redactForEmployee(data, (p) => p.standardPrice, "u-emp");
  assert.equal(other.staff.length, 0);
});

test("calendar items: private stays private, shared reaches only who it's shared with, only the owner changes one", () => {
  const item = (id: string, ownerId: string, visibility: "private" | "everyone" | "people", sharedWith: string[] = []) =>
    ({ id, title: id, kind: "event", date: "2026-10-30", endDate: null, startTime: null, endTime: null, location: "", notes: "", ownerId, ownerName: ownerId, visibility, sharedWith, done: false, createdAt: "" }) as const;
  const items = [item("mine", "u1", "private"), item("theirs", "u2", "private"), item("all", "u2", "everyone"), item("toMe", "u2", "people", ["u1"]), item("toOther", "u2", "people", ["u3"])];
  assert.deepEqual(visibleCalendarItems([...items], "u1").map((i) => i.id), ["mine", "all", "toMe"]);
  const add = decideWrite({ role: "employee", user: { id: "u1", name: "Ruchel" }, collection: "calendarItems", op: "append", item: { id: "n", ownerId: "someone-else" } });
  assert.equal(add.allow && add.item?.ownerId, "u1");
  assert.equal(decideWrite({ role: "executive", user: { id: "u9", name: "Boss" }, collection: "calendarItems", op: "update", item: { id: "theirs" }, existing: { ...items[1] } }).allow, false);
  assert.ok(decideWrite({ role: "employee", user: { id: "u2", name: "X" }, collection: "calendarItems", op: "delete", existing: { ...items[1] } }).allow);
});
