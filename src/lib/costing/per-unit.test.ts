import { test } from "node:test";
import assert from "node:assert/strict";
import { perBatch, perUnit, unitsPerBatch, withBatchSize } from "./per-unit.ts";
import type { Product } from "../store/types.ts";

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: "p",
    name: "Spread",
    batchYield: 20,
    minutesPerBatch: 60,
    laborCostOverride: null,
    recipeIngredients: [{ id: "r1", materialId: "m1", quantity: 2 }],
    recipeComponents: [{ id: "c1", productId: "p2", quantity: 10 }],
    recipeMisc: [{ id: "x", label: "Gas", cost: 40 }],
    recipeLabor: [],
    ...over,
  }) as Product;

test("amounts convert between one batch and one unit", () => {
  const p = product();
  assert.equal(perUnit(p, 2), 0.1);
  assert.equal(perBatch(p, 0.1), 2);
});

test("a product with no batch size reads its recipe as being for one unit", () => {
  const p = product({ batchYield: 0 });
  assert.equal(unitsPerBatch(p), 1);
  assert.equal(perUnit(p, 0.25), 0.25);
});

test("changing the batch size keeps every amount the same per unit", () => {
  const p = product();
  const next = { ...p, ...withBatchSize(p, 30) };
  assert.equal(next.batchYield, 30);
  assert.equal(perUnit(next, next.recipeIngredients[0].quantity), 0.1);
  assert.equal(perUnit(next, next.recipeComponents![0].quantity), 0.5);
  assert.equal(perUnit(next, next.recipeMisc[0].cost), 2);
  assert.equal(perUnit(next, next.minutesPerBatch!), 3);
});
