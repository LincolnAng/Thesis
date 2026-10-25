import { test } from "node:test";
import assert from "node:assert/strict";
import { downstreamFirst, planProduction, type PlanMaterial } from "./plan.ts";

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

test("each stage covers its own demand plus what the next stage uses, unit by unit", () => {
  const r = planProduction({ products: products as never, materials, demand });
  const by = Object.fromEntries(r.products.map((p) => [p.productId, p]));
  // Packs: need 45, have 5 → make 40. Ice: make 70.
  assert.equal(by.packs.shortfall, 40);
  assert.equal(by.ice.shortfall, 70);
  // Tablea per unit: packs 3/20 kg, ice 2/40 kg → 40×0.15 + 70×0.05 = 9.5 kg, 4 on hand → 5.5.
  assert.equal(by.tablea.usedByOthers, 9.5);
  assert.equal(by.tablea.shortfall, 5.5);
});

test("non-negativity: nothing planned below zero, even with more stock than needed", () => {
  const r = planProduction({
    products: products as never,
    materials,
    demand: new Map([["packs", 2]]),
  });
  for (const p of r.products) {
    assert.ok(p.shortfall >= 0 && p.canMakeNow >= 0, p.name);
  }
  for (const m of r.materials) assert.ok(m.toBuy >= 0 && m.required >= 0, m.name);
  assert.equal(r.products.find((p) => p.productId === "packs")?.shortfall, 0);
});

test("raw materials needed add up across stages; what's missing is the amount to buy", () => {
  const r = planProduction({ products: products as never, materials, demand });
  const by = Object.fromEntries(r.materials.map((m) => [m.materialId, m]));
  assert.equal(by.beans.required, 6.6); // 5.5 kg tablea × 12/10
  assert.equal(by.milk.required, 14); // 70 ice cream × 8/40
  assert.equal(by.milk.toBuy, 4); // 10 L on hand
});

test("availability: what can be made now never uses more than is on hand", () => {
  const r = planProduction({ products: products as never, materials, demand });
  const ice = r.products.find((p) => p.productId === "ice");
  // 10 L of milk covers 50 ice creams, not 70.
  assert.equal(ice?.canMakeNow, 50);
  assert.equal(ice?.limitedBy, "Milk");
});

test("a product with no batch size counts its recipe as one unit", () => {
  const brandy = product("brandy", "Brandy", 0, 0, { m: [["milk", 1]] });
  const r = planProduction({ products: [brandy] as never, materials, demand: new Map([["brandy", 6]]) });
  assert.equal(r.products[0].shortfall, 6);
  assert.equal(r.materials.find((m) => m.materialId === "milk")?.required, 6);
});

test("a recipe that uses itself doesn't loop", () => {
  const loop = product("loop", "Loop", 5, 0, { c: [["loop", 1]] });
  const r = planProduction({ products: [loop] as never, materials: [], demand: new Map([["loop", 5]]) });
  assert.equal(r.products[0].shortfall, 5);
});
