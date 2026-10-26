import { test } from "node:test";
import assert from "node:assert/strict";
import { forecastProduct, spoilageTrim } from "./forecast.ts";

// What spoiled unsold lowers next month's forecast. Run with `npm test`.

const spread = { id: "p1", name: "Spread", unit: "jars", batchYield: 10, stockQty: 0, lowStockThreshold: 0, recipeIngredients: [], recipeComponents: [], recipeLabor: [], recipeMisc: [] } as never;
const entry = (type: "SALE" | "WASTE", month: string, quantity: number) =>
  ({ id: `${type}${month}${quantity}`, timestamp: `${month}-15T00:00:00Z`, type, amount: 0, quantity, unit: "jars", sku: "Spread", counterparty: null, location: null, priceType: null, category: null, rawText: "", confidence: 1 }) as never;
const now = new Date(2026, 9, 20); // October; July–September are the last three full months

const sales = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((m) => entry("SALE", m, 30));

test("no spoilage, no trim", () => {
  assert.equal(spoilageTrim("p1", sales, [spread], now).trim, 0);
  assert.equal(forecastProduct(spread, sales, [spread], now).spoilageTrim, 0);
});

test("a fifth of what left the shelf spoiled → the forecast is a fifth lower", () => {
  // Jul–Sep: 90 sold, 22.5 → use 30 spoiled of 120 out = 25%.
  const spoiled = [...sales, entry("WASTE", "2026-08", 30)];
  const plain = forecastProduct(spread, sales, [spread], now).forecastQty;
  const trimmed = forecastProduct(spread, spoiled, [spread], now);
  assert.equal(trimmed.spoilageTrim, 0.25);
  assert.equal(trimmed.forecastQty, Math.round(plain * 0.75));
  assert.match(trimmed.reliability.reason, /Lowered 25% because 30 spoiled/);
});

test("spoilage outside the last three months doesn't count, and the trim is capped at half", () => {
  assert.equal(spoilageTrim("p1", [...sales, entry("WASTE", "2026-05", 100)], [spread], now).trim, 0);
  assert.equal(spoilageTrim("p1", [...sales, entry("WASTE", "2026-09", 500)], [spread], now).trim, 0.5);
});
