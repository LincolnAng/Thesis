import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGlance, computeHeadliners, netIncome, type TodayInputs } from "./today.ts";

// Home's figures and headliners. Run with `npm test`.

const now = new Date(2026, 9, 15, 14, 0); // 15 Oct 2026, 2pm local
const at = (y: number, m: number, d: number) => new Date(y, m, d, 10, 0).toISOString();

const tablea = { id: "p1", name: "Cacao Tablea 150g", stockQty: 40, lowStockThreshold: 10 };
const iceCream = { id: "p2", name: "Tablea Ice Cream 90g", stockQty: 5, lowStockThreshold: 12 };

function inputs(over: Partial<TodayInputs> = {}): TodayInputs {
  return {
    now,
    role: "executive",
    products: [tablea, iceCream] as never,
    entries: [
      { id: "s1", type: "SALE", amount: 1500, quantity: 10, sku: "Cacao Tablea 150g", timestamp: at(2026, 9, 15) },
      { id: "s2", type: "SALE", amount: 600, quantity: 4, sku: "Cacao Tablea 150g", timestamp: at(2026, 9, 14) },
      { id: "x1", type: "EXPENSE", amount: 200, category: "transport", timestamp: at(2026, 9, 15) },
    ] as never,
    costPerUnit: (p) => (p.id === "p1" ? 60 : null),
    lowMaterials: [],
    outlook: [],
    ...over,
  };
}

test("today's sales, yesterday's for comparison, and today's spending", () => {
  const g = computeGlance(inputs());
  assert.equal(g.salesToday, 1500);
  assert.equal(g.salesCountToday, 1);
  assert.equal(g.salesYesterday, 600);
  assert.equal(g.expensesToday, 200);
});

test("net income is sales less product cost, spending and spoilage", () => {
  const g = computeGlance(inputs());
  // 1500 − 10 × 60 − 200
  assert.deepEqual(g.netIncomeToday, { value: 700 });
});

test("net income is never guessed when a product sold has no cost", () => {
  const result = netIncome(
    [{ id: "s", type: "SALE", amount: 300, quantity: 2, sku: "Tablea Ice Cream 90g", timestamp: at(2026, 9, 15) }] as never,
    [tablea, iceCream] as never,
    (p) => (p.id === "p1" ? 60 : null),
  );
  assert.ok("unavailable" in result);
  assert.match((result as { unavailable: string }).unavailable, /Tablea Ice Cream 90g/);
});

test("employees see no spending or income figures", () => {
  const g = computeGlance(inputs({ role: "employee" }));
  assert.equal(g.expensesToday, null);
  assert.equal(g.netIncomeToday, null);
  assert.equal(g.salesToday, 1500);
});

test("inventory alerts count low products and low materials", () => {
  const g = computeGlance(inputs({ lowMaterials: [{ name: "Cacao beans", onHand: 3, threshold: 10, unit: "kg" }] }));
  assert.equal(g.inventoryAlerts, 2); // ice cream (5 ≤ 12) + cacao beans
});

test("headliners put urgent stock problems first", () => {
  const list = computeHeadliners(inputs({ lowMaterials: [{ name: "Cacao beans", onHand: 3, threshold: 10, unit: "kg" }] }));
  assert.equal(list[0].tone, "urgent");
  assert.ok(list.some((h) => h.id === "materials-low"));
  assert.ok(list.some((h) => h.id === "produce-p2"));
});

test("a product short of next month's expected sales needs production", () => {
  const list = computeHeadliners(inputs({ outlook: [{ productId: "p1", productName: "Cacao Tablea 150g", forecastQty: 100 }] }));
  const h = list.find((x) => x.id === "produce-p1");
  assert.ok(h);
  assert.equal(h.tone, "watch");
  assert.match(h.detail, /about 100 are expected/);
});

test("profit headliner says why it can't be worked out instead of guessing", () => {
  const list = computeHeadliners(
    inputs({
      entries: [{ id: "s", type: "SALE", amount: 300, quantity: 2, sku: "Tablea Ice Cream 90g", timestamp: at(2026, 9, 3) }] as never,
    }),
  );
  const h = list.find((x) => x.id === "profit");
  assert.ok(h);
  assert.match(h.title, /can't be worked out/);
});

test("employees get no money headliners", () => {
  const list = computeHeadliners(inputs({ role: "employee" }));
  for (const id of ["sales", "profit", "expense"]) assert.ok(!list.some((h) => h.id === id), id);
  const best = list.find((h) => h.id === "best-seller");
  assert.ok(best && !best.detail.includes("₱"));
});

test("an expense category well above its usual month is flagged", () => {
  const entries = [
    ...[1, 2, 3].map((back) => ({ id: `t${back}`, type: "EXPENSE", amount: 800, category: "transport", timestamp: at(2026, 9 - back, 10) })),
    { id: "t0", type: "EXPENSE", amount: 2600, category: "transport", timestamp: at(2026, 9, 10) },
  ];
  const h = computeHeadliners(inputs({ entries: entries as never })).find((x) => x.id === "expense");
  assert.ok(h);
  assert.match(h.title, /transport/);
});

test("sales are compared with the same days of last month", () => {
  const entries = [
    { id: "a", type: "SALE", amount: 1200, quantity: 1, sku: "Cacao Tablea 150g", timestamp: at(2026, 9, 5) },
    { id: "b", type: "SALE", amount: 1000, quantity: 1, sku: "Cacao Tablea 150g", timestamp: at(2026, 8, 5) },
    { id: "c", type: "SALE", amount: 9000, quantity: 1, sku: "Cacao Tablea 150g", timestamp: at(2026, 8, 28) }, // after day 15: not counted
  ];
  const h = computeHeadliners(inputs({ entries: entries as never })).find((x) => x.id === "sales");
  assert.ok(h);
  assert.equal(h.title, "Sales are up 20% on last month");
});
