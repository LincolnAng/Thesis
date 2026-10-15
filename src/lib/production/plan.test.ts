import { test } from "node:test";
import assert from "node:assert/strict";
import { downstreamFirst, planProduction, processChain, type PlanMaterial } from "./plan.ts";

// Production planning across cacao → tablea → packs / ice cream / brandy. Run with `npm test`.

function product(id: string, name: string, batchYield: number, stockQty: number, recipe: { m?: [string, number][]; c?: [string, number][] } = {}) {
  return {
    id,
    name,
    unit: id === "tablea" ? "kg" : "pcs",
    batchYield,
    stockQty,
    lowStockThreshold: 0,
    recipeIngredients: (recipe.m ?? []).map(([materialId, quantity], i) => ({ id: `${id}-i${i}`, materialId, quantity })),
    recipeComponents: (recipe.c ?? []).map(([productId, quantity], i) => ({ id: `${id}-c${i}`, productId, quantity })),
    recipeLabor: [],
    recipeMisc: [],
  };
}

// Tablea: 10 kg a batch from 12 kg beans. Packs: 20 a batch, 3 kg tablea + 20 pouches.
// Ice cream: 40 a batch, 2 kg tablea + 8 L milk.
const tablea = product("tablea", "Tablea (bulk)", 10, 4, { m: [["beans", 12]] });
const packs = product("packs", "Cacao Tablea 150g", 20, 5, { c: [["tablea", 3]], m: [["pouch", 20]] });
const iceCream = product("ice", "Tablea Ice Cream 90g", 40, 0, { c: [["tablea", 2]], m: [["milk", 8]] });
const products = [tablea, packs, iceCream] as never[];

const materials: PlanMaterial[] = [
  { id: "beans", name: "Cacao beans", unit: "kg", onHand: 30, reorderPoint: 10 },
  { id: "pouch", name: "Pouches", unit: "pcs", onHand: 100, reorderPoint: 0 },
  { id: "milk", name: "Milk", unit: "L", onHand: 10, reorderPoint: 0 },
];

const demand = new Map([
  ["packs", 45],
  ["ice", 70],
]);

test("products made from another are planned before it", () => {
  const order = downstreamFirst(products as never).map((p) => p.id);
  assert.ok(order.indexOf("packs") < order.indexOf("tablea"));
  assert.ok(order.indexOf("ice") < order.indexOf("tablea"));
});

test("each stage covers its own demand plus what the next stage uses, in whole batches", () => {
  const r = planProduction({ products: products as never, materials, demand });
  const by = Object.fromEntries(r.products.map((p) => [p.productId, p]));
  // Packs: need 45, have 5 → 40 short → 2 batches (40). Ice: 70 short → 2 batches (80).
  assert.equal(by.packs.batches, 2);
  assert.equal(by.ice.batches, 2);
  // Tablea is needed by both: 2×3 + 2×2 = 10 kg, 4 on hand → 6 short → 1 batch of 10.
  assert.equal(by.tablea.usedByOthers, 10);
  assert.equal(by.tablea.batches, 1);
});

test("balance: what is produced always covers the shortfall", () => {
  const r = planProduction({ products: products as never, materials, demand });
  for (const p of r.products) assert.ok(p.produced >= p.shortfall, p.name);
});

test("non-negativity: nothing planned below zero, even with more stock than needed", () => {
  const r = planProduction({
    products: products as never,
    materials,
    demand: new Map([["packs", 2]]),
  });
  for (const p of r.products) {
    assert.ok(p.shortfall >= 0 && p.batches >= 0 && p.canMakeNow >= 0, p.name);
  }
  for (const m of r.materials) assert.ok(m.toBuy >= 0 && m.required >= 0, m.name);
  assert.equal(r.products.find((p) => p.productId === "packs")?.batches, 0);
});

test("raw materials needed add up across stages; what's missing is a restock amount", () => {
  const r = planProduction({ products: products as never, materials, demand });
  const by = Object.fromEntries(r.materials.map((m) => [m.materialId, m]));
  assert.equal(by.beans.required, 12); // one tablea batch
  assert.equal(by.milk.required, 16); // two ice cream batches
  assert.equal(by.milk.toBuy, 6); // 10 L on hand
  assert.ok(r.alerts.some((a) => a.kind === "restock" && a.title.includes("6 L of Milk")));
});

test("availability: what can be made now never uses more than is on hand", () => {
  const r = planProduction({ products: products as never, materials, demand });
  const ice = r.products.find((p) => p.productId === "ice");
  // 10 L of milk covers one 8 L batch, not two.
  assert.equal(ice?.canMakeNow, 1);
  assert.equal(ice?.limitedBy, "Milk");
  assert.ok(r.alerts.some((a) => a.kind === "limited" && a.title.includes("Only 1 of 2")));
});

test("what an upstream stage makes now feeds the next stage", () => {
  // Tablea on hand (4 kg) can't cover packs (6 kg) and ice cream (4 kg) alone; the tablea
  // batch the beans allow (10 kg) makes up the difference.
  const r = planProduction({ products: products as never, materials, demand });
  const packsPlan = r.products.find((p) => p.productId === "packs");
  assert.equal(r.products.find((p) => p.productId === "tablea")?.canMakeNow, 1);
  assert.equal(packsPlan?.canMakeNow, 2);
});

test("a product short with no batch size is flagged, not planned", () => {
  const brandy = product("brandy", "Brandy", 0, 0, { c: [["tablea", 1]] });
  const r = planProduction({ products: [...products, brandy] as never, materials, demand: new Map([["brandy", 6]]) });
  const b = r.products.find((p) => p.productId === "brandy");
  assert.equal(b?.batches, 0);
  assert.equal(b?.missingBatchSize, true);
  assert.ok(r.alerts.some((a) => a.kind === "no_batch_size"));
});

test("a recipe that uses itself doesn't loop", () => {
  const loop = product("loop", "Loop", 5, 0, { c: [["loop", 1]] });
  const r = planProduction({ products: [loop] as never, materials: [], demand: new Map([["loop", 5]]) });
  assert.equal(r.products[0].batches, 1);
});

test("the process chain comes from the recipes", () => {
  const chain = processChain(products as never, [
    { id: "beans", name: "Cacao beans", kind: "ingredient" },
    { id: "milk", name: "Milk", kind: "ingredient" },
    { id: "pouch", name: "Pouches", kind: "packaging" },
  ]);
  assert.deepEqual(chain.inHouse.map((n) => n.name), ["Tablea (bulk)"]);
  assert.deepEqual(chain.inHouse[0].feeds.sort(), ["Cacao Tablea 150g", "Tablea Ice Cream 90g"]);
  assert.deepEqual(chain.rawMaterials.find((n) => n.id === "beans")?.feeds, ["Tablea (bulk)"]);
  assert.deepEqual(chain.packaging.map((n) => n.name), ["Pouches"]);
  assert.deepEqual(chain.products.map((n) => n.name).sort(), ["Cacao Tablea 150g", "Tablea Ice Cream 90g"]);
});
