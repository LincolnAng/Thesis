import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveProductPrice, productCostPerJar, type CostContext } from "./recipe-cost.ts";
import type { Product, RawMaterialStock, SupplierPrice } from "@/lib/store/types";

// Cost propagation: a product's cost and its cost-based price are worked out from the recipe
// and the materials every time, so changing either changes the product — nothing is stored.

const beans: RawMaterialStock = { id: "m-beans", name: "Sugar", unit: "kg", qty: 10, lowStockThreshold: 0, perBatchQty: null, color: null, unitCost: 0, kind: "ingredient" };
const jar: RawMaterialStock = { id: "m-jar", name: "Jar", unit: "pcs", qty: 100, lowStockThreshold: 0, perBatchQty: null, color: null, unitCost: 0, kind: "packaging" };

function price(materialId: string, pesos: number, quantity: number, unit: string): SupplierPrice {
  return { id: `sp-${materialId}-${pesos}`, materialId, supplierId: "s1", price: pesos, quantity, unit, loggedAt: "2026-06-01T00:00:00Z" } as SupplierPrice;
}

const product: Product = {
  id: "p1",
  name: "Test spread",
  standardPrice: 0,
  pricingMode: "cost_percent",
  marginPercent: 50,
  marketPrice: 0,
  friendPrice: 0,
  wholesalePrice: 0,
  stockQty: 0,
  lowStockThreshold: 0,
  batchYield: 10,
  recipeIngredients: [
    { id: "r1", materialId: "m-beans", quantity: 2 },
    { id: "r2", materialId: "m-jar", quantity: 10 },
  ],
  recipeLabor: [],
  recipeMisc: [{ id: "x1", label: "Gas", cost: 50 }],
};

function ctx(supplierPrices: SupplierPrice[]): CostContext {
  return { rawMaterials: [beans, jar], supplierPrices, hourlyLaborRate: 0, cacaoUtilization: 1, entries: [], products: [product] };
}

test("cost per jar adds raw materials, packaging and fixed costs over the batch", () => {
  const cost = productCostPerJar(product, ctx([price("m-beans", 100, 1, "kg"), price("m-jar", 150, 10, "pcs")]));
  // (2 kg × ₱100 + 10 jars × ₱15 + ₱50 fixed) ÷ 10 jars
  assert.equal(cost.costPerJar, 40);
  assert.equal(cost.packagingPerJar, 15);
  assert.equal(cost.miscPerJar, 5);
  assert.deepEqual(cost.unpriced, []);
});

test("a new raw-material price flows into the product's cost and its markup price", () => {
  const before = productCostPerJar(product, ctx([price("m-beans", 100, 1, "kg"), price("m-jar", 150, 10, "pcs")]));
  const after = productCostPerJar(product, ctx([price("m-beans", 150, 1, "kg"), price("m-jar", 150, 10, "pcs")]));
  assert.equal(after.costPerJar - before.costPerJar, 10);
  assert.equal(effectiveProductPrice(product, before), 60);
  assert.equal(effectiveProductPrice(product, after), 75);
});

test("a recipe change flows into the cost", () => {
  const prices = [price("m-beans", 100, 1, "kg"), price("m-jar", 150, 10, "pcs")];
  const leaner = { ...product, recipeIngredients: [{ id: "r1", materialId: "m-beans", quantity: 1 }, product.recipeIngredients[1]] };
  assert.equal(productCostPerJar(leaner, { ...ctx(prices), products: [leaner] }).costPerJar, 30);
});

test("a material with no cost is reported, and a cost-based price falls back to the set price", () => {
  const cost = productCostPerJar(product, ctx([price("m-jar", 150, 10, "pcs")]));
  assert.deepEqual(cost.unpriced, ["Sugar"]);
  assert.equal(effectiveProductPrice({ ...product, standardPrice: 99 }, cost), 99);
});

test("a product with no recipe costs nothing and keeps its own price", () => {
  const empty = { ...product, recipeIngredients: [], recipeMisc: [], pricingMode: "manual" as const, standardPrice: 0 };
  const cost = productCostPerJar(empty, ctx([]));
  assert.equal(cost.costPerJar, 0);
  assert.equal(effectiveProductPrice(empty, cost), 0);
});
