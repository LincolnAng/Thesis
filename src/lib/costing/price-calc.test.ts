import { test } from "node:test";
import assert from "node:assert/strict";
import { costPerUnit, evaluate, priceFor } from "./price-calc.ts";

test("markup, margin and profit per unit use the standard formulas", () => {
  const r = evaluate(150, 100);
  assert.equal(r.profit, 50);
  assert.equal(r.markupPct, 50);
  assert.equal(r.marginPct, 33.33);
});

test("a price can be set directly, from a markup, or from a target margin", () => {
  assert.equal(priceFor("price", 180, 100), 180);
  assert.equal(priceFor("markup", 50, 100), 150);
  assert.equal(priceFor("margin", 50, 100), 200);
});

test("markup or margin with no known cost gives no price rather than a wrong one", () => {
  assert.equal(priceFor("markup", 50, null), null);
  assert.equal(priceFor("margin", 50, 0), null);
  assert.equal(priceFor("margin", 100, 100), null);
});

test("nothing divides by zero", () => {
  assert.equal(evaluate(0, 100).marginPct, null);
  assert.equal(evaluate(150, 0).markupPct, null);
  assert.equal(evaluate(null, 100).profit, null);
  assert.equal(costPerUnit(500, 0, true), null);
});

test("cost per unit is batch cost over units made, and only when the recipe is fully priced", () => {
  assert.equal(costPerUnit(1250, 50, true), 25);
  assert.equal(costPerUnit(1250, 50, false), null);
});
