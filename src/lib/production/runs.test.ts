import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketBalance, cacaoMaterials, cacaoPerUnit, packagingUsed, runMaterials, runTotals } from "./runs.ts";
import { drawOf } from "./batch-draws.ts";
import { consumedQty } from "../summary/ingredient-cost.ts";

// Production runs and the leftover cacao bucket. Run with `npm test`.

const beans = { id: "beans", name: "Cacao beans", unit: "kg", kind: "ingredient" as const, qty: 50, lowStockThreshold: 0, perBatchQty: null, color: null, unitCost: 300 };
const sugar = { id: "sugar", name: "Sugar", unit: "kg", kind: "ingredient" as const, qty: 20, lowStockThreshold: 0, perBatchQty: null, color: null, unitCost: 60 };
const jar = { id: "jar", name: "Jar 100g", unit: "pcs", kind: "packaging" as const, qty: 500, lowStockThreshold: 0, perBatchQty: null, color: null, unitCost: 12 };
const materials = [beans, sugar, jar];

const tablea = {
  id: "tablea",
  name: "Tablea",
  unit: "jars",
  batchYield: 10,
  stockQty: 0,
  lowStockThreshold: 0,
  standardPrice: 0,
  pricingMode: "manual" as const,
  marginPercent: 0,
  marketPrice: 0,
  friendPrice: 0,
  wholesalePrice: 0,
  recipeIngredients: [
    { id: "r1", materialId: "beans", quantity: 1 }, // 1 kg usable cacao per 10 jars
    { id: "r2", materialId: "sugar", quantity: 0.5 },
    { id: "r3", materialId: "jar", quantity: 10 },
  ],
  recipeLabor: [],
  recipeMisc: [],
};

function entry(over: Record<string, unknown>) {
  return { id: String(Math.random()), timestamp: "2026-10-05T08:00:00Z", amount: null, quantity: null, unit: null, sku: null, counterparty: null, location: null, priceType: null, category: null, rawText: "", confidence: 1, ...over } as never;
}

test("only raw cacao counts as what a roast starts from", () => {
  assert.deepEqual(cacaoMaterials(materials).map((m) => m.id), ["beans"]);
});

test("cacao per unit comes from the recipe, per unit not per batch", () => {
  assert.equal(cacaoPerUnit(tablea, "beans"), 0.1);
  assert.equal(cacaoPerUnit(tablea, "sugar"), 0.05);
});

test("the bucket is what went in minus what came out, per material", () => {
  const moves = [
    { id: "a", materialId: "beans", direction: "in" as const, qty: 0.4, unit: "kg", date: "2026-10-01", runId: "r1", purpose: "", createdAt: "" },
    { id: "b", materialId: "beans", direction: "in" as const, qty: 0.3, unit: "kg", date: "2026-10-02", runId: "r2", purpose: "", createdAt: "" },
    { id: "c", materialId: "beans", direction: "out" as const, qty: 0.5, unit: "kg", date: "2026-10-03", runId: null, purpose: "Samples", createdAt: "" },
    { id: "d", materialId: "other", direction: "in" as const, qty: 9, unit: "kg", date: "2026-10-03", runId: null, purpose: "", createdAt: "" },
  ];
  assert.equal(bucketBalance(moves, "beans"), 0.2);
});

test("a batch in a run draws no raw cacao — the roast already took it — but still its other ingredients", () => {
  const batch = entry({ type: "INVENTORY_IN", sku: "Tablea", quantity: 40, runId: "run1" });
  assert.equal(drawOf(batch, tablea, beans, 0.7), 0);
  assert.equal(drawOf(batch, tablea, sugar, 0.7), 2);
  assert.equal(drawOf(batch, tablea, jar, 0.7), 40);
  // The same batch outside a run draws raw cacao by the recipe, scaled up by the utilization.
  const plain = entry({ type: "INVENTORY_IN", sku: "Tablea", quantity: 40 });
  assert.ok(Math.abs(drawOf(plain, tablea, beans, 0.8) - 5) < 1e-9);
});

test("a material named in a batch's list draws exactly that — 0 for a run's raw material", () => {
  const batch = entry({ type: "INVENTORY_IN", sku: "Tablea", quantity: 40, runId: "run1", packagingUsed: [{ materialId: "sugar", qty: 0 }, { materialId: "jar", qty: 40 }] });
  assert.equal(drawOf(batch, tablea, sugar, 0.7), 0);
  assert.equal(drawOf(batch, tablea, jar, 0.7), 40);
});

test("a run can start from any ingredient, raw cacao first", () => {
  assert.deepEqual(runMaterials([sugar, jar, beans]).map((m) => m.id), ["beans", "sugar"]);
});

test("the roast counts as raw cacao consumed, once", () => {
  const roast = entry({ type: "INVENTORY_OUT", category: "material_use", sku: "Cacao beans", quantity: 10, unit: "kg", runId: "run1" });
  const batch = entry({ type: "INVENTORY_IN", sku: "Tablea", quantity: 40, runId: "run1" });
  assert.equal(consumedQty([roast, batch], [tablea], beans, 0.7), 10);
  assert.equal(consumedQty([roast, batch], [tablea], sugar, 0.7), 2);
});

test("run totals add up the roast, the yield, the products and what was left", () => {
  const runs = [
    { id: "run1", name: "", date: "2026-10-05", lotId: "L1", materialId: "beans", unit: "kg", rawQty: 10, usableQty: 7, pelletsQty: 7, fromBucketQty: 0, intoProductsQty: 6.6, leftoverQty: 0.4, made: "", notes: "", createdAt: "a" },
    { id: "run2", name: "", date: "2026-10-09", lotId: "L2", materialId: "beans", unit: "kg", rawQty: 0, usableQty: 0, pelletsQty: 0, fromBucketQty: 0.4, intoProductsQty: 0.4, leftoverQty: 0, made: "", notes: "", createdAt: "b" },
  ];
  const entries = [
    entry({ type: "INVENTORY_IN", sku: "Tablea", quantity: 66, unit: "jars", runId: "run1" }),
    entry({ type: "INVENTORY_IN", sku: "Tablea", quantity: 4, unit: "jars", runId: "run2" }),
    entry({ type: "INVENTORY_IN", sku: "Tablea", quantity: 99, unit: "jars" }), // not in a run
  ];
  const t = runTotals(runs, entries, [tablea]);
  assert.equal(t.raw, 10);
  assert.equal(t.usable, 7);
  assert.equal(t.pellets, 7);
  assert.equal(t.yield, 0.7);
  assert.equal(t.intoProducts, 7);
  assert.equal(t.leftover, 0.4);
  assert.deepEqual(t.made, [{ productId: "tablea", qty: 70, unit: "jars" }]);
});

test("packaging used is what was picked, or the recipe's when nothing was", () => {
  const picked = entry({ type: "INVENTORY_IN", sku: "Tablea", quantity: 20, packagingUsed: [{ materialId: "jar", qty: 22 }] });
  const byRecipe = entry({ type: "INVENTORY_IN", sku: "Tablea", quantity: 10 });
  assert.deepEqual(packagingUsed([picked, byRecipe], [tablea], materials, 0.7).map((p) => [p.material.id, p.qty]), [["jar", 32]]);
});
