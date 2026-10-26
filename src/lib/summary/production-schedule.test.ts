import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProductionPlan, type PlanInput } from "./production-schedule.ts";

// The calendar from machines that say what they make and how fast. Run with `npm test`.

const product = (id: string, batchYield = 10, recipe: [string, number][] = []) =>
  ({
    id,
    name: id,
    unit: "jars",
    batchYield,
    stockQty: 0,
    lowStockThreshold: 0,
    recipeIngredients: recipe.map(([materialId, quantity], i) => ({ id: `${id}${i}`, materialId, quantity })),
    recipeComponents: [],
    recipeLabor: [],
    recipeMisc: [],
  }) as never;

const machine = (id: string, outputs: { itemId: string; kind: "product" | "material"; qty: number; per: "hour" | "day" }[], hoursPerDay = 8) => ({
  id,
  name: id,
  outputs,
  hoursPerDay,
  workingDaysPerWeek: 7,
  notes: "",
  createdAt: "",
});

// Wed 14 Oct 2026; an event on the 31st wants 100 jars of spread.
function input(over: Partial<PlanInput>): PlanInput {
  return {
    products: [product("spread", 10, [["cacao", 2]])],
    entries: [],
    machines: [],
    rawMaterials: [{ id: "cacao", name: "Sugar", unit: "kg", qty: 5 }] as never,
    events: [{ id: "ev", name: "Fair", kind: "event", startDate: "2026-10-31", endDate: "2026-10-31", status: "open", notes: "", createdAt: "" }],
    eventPlans: { ev: { spread: 100 } },
    unavailable: new Set(),
    shelfLifeDays: () => 90,
    cacaoUtilization: 1,
    strategy: "fastest",
    now: new Date(2026, 9, 14),
    ...over,
  };
}

test("a machine's output a day decides how much lands on each day", () => {
  const plan = buildProductionPlan(input({ machines: [machine("mixer", [{ itemId: "spread", kind: "product", qty: 5, per: "hour" }])] }));
  const runs = plan.days.flatMap((d) => d.runs.map((r) => ({ date: d.date, qty: r.qty })));
  // 5 an hour × 8 hours = 40 a day → 40, 40, 20 from today.
  assert.deepEqual(runs, [
    { date: "2026-10-14", qty: 40 },
    { date: "2026-10-15", qty: 40 },
    { date: "2026-10-16", qty: 20 },
  ]);
  assert.equal(plan.totalJarsScheduled, 100);
  assert.deepEqual(plan.unplaced, []);
});

test("something no machine makes is named, not silently dropped", () => {
  const plan = buildProductionPlan(input({ machines: [machine("roaster", [{ itemId: "other", kind: "product", qty: 10, per: "day" }])] }));
  assert.deepEqual(plan.noMachine.map((x) => [x.itemId, x.qty]), [["spread", 100]]);
  assert.equal(plan.needs[0].noMachine, true);
});

test("raw materials are counted per unit, and a short one a machine makes is scheduled first", () => {
  const plan = buildProductionPlan(
    input({
      machines: [
        machine("mixer", [{ itemId: "spread", kind: "product", qty: 100, per: "day" }]),
        machine("mill", [{ itemId: "cacao", kind: "material", qty: 1, per: "hour" }]),
      ],
    }),
  );
  // 2 kg per batch of 10 → 0.2 kg a jar × 100 = 20 kg; 5 on hand → 15 short, made at 8 kg a day.
  const need = plan.ingredientNeeds[0];
  assert.equal(need.required, 20);
  assert.equal(need.short, 15);
  assert.equal(need.madeInHouse, true);
  const milled = plan.days.flatMap((d) => d.runs.filter((r) => r.kind === "material").map((r) => r.qty));
  assert.deepEqual(milled, [8, 7]);
});

test("Latest Start makes it as close to the deadline as fits", () => {
  const plan = buildProductionPlan(
    input({ strategy: "min_expiry", machines: [machine("mixer", [{ itemId: "spread", kind: "product", qty: 60, per: "day" }])] }),
  );
  const dates = plan.days.filter((d) => d.runs.length).map((d) => d.date);
  assert.deepEqual(dates, ["2026-10-29", "2026-10-30"]);
});

test("a machine that makes two things splits its day between them", () => {
  const plan = buildProductionPlan(
    input({
      products: [product("spread"), product("bar")],
      eventPlans: { ev: { spread: 20, bar: 50 } },
      machines: [
        machine("mixer", [
          { itemId: "spread", kind: "product", qty: 40, per: "day" },
          { itemId: "bar", kind: "product", qty: 100, per: "day" },
        ]),
      ],
    }),
  );
  // 20 spread is half the day; the other half makes 50 bars.
  const first = plan.days.find((d) => d.date === "2026-10-14");
  assert.deepEqual(first?.runs.map((r) => [r.itemId, r.qty]).sort(), [["bar", 50], ["spread", 20]]);
});

test("roasting and making products never land on the same day", () => {
  const plan = buildProductionPlan(
    input({
      machines: [
        machine("mixer", [{ itemId: "spread", kind: "product", qty: 100, per: "day" }]),
        machine("mill", [{ itemId: "cacao", kind: "material", qty: 1, per: "hour" }]),
      ],
    }),
  );
  for (const d of plan.days) assert.ok(new Set(d.runs.map((r) => r.kind)).size <= 1, d.date);
  const productDays = plan.days.filter((d) => d.runs.some((r) => r.kind === "product")).map((d) => d.date);
  const materialDays = plan.days.filter((d) => d.runs.some((r) => r.kind === "material")).map((d) => d.date);
  assert.ok(productDays.length > 0 && materialDays.length > 0);
  assert.ok(materialDays[0] < productDays[0], "roasting comes first");
});
