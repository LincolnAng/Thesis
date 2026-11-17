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

// Decision E: quiet months count as zero, two of them retire a product, and the units are
// matched to the shop's revenue trend.
const priced = (month: string, quantity: number, amount: number, sku = "Spread") =>
  ({ id: `s${sku}${month}`, timestamp: `${month}-15T00:00:00Z`, type: "SALE", amount, quantity, unit: "jars", sku, counterparty: null, location: null, priceType: null, category: null, rawText: "", confidence: 1 }) as never;

test("no sales in the last two full months: retired, forecast at 0", async () => {
  const { forecastAll } = await import("./forecast.ts");
  const stopped = ["2026-04", "2026-05", "2026-06", "2026-07"].map((m) => priced(m, 30, 300));
  const [f] = forecastAll([spread], stopped, now); // October: August and September were quiet
  assert.equal(f.retired, true);
  assert.equal(f.forecastQty, 0);
  assert.ok(f.monthly.every((m) => m.units === 0));
  assert.match(f.reliability.reason, /no longer sold/);
});

test("one quiet month isn't enough to retire a product", async () => {
  const { forecastAll } = await import("./forecast.ts");
  const paused = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"].map((m) => priced(m, 30, 300));
  const [f] = forecastAll([spread], paused, now); // only September quiet
  assert.equal(f.retired, false);
  assert.ok(f.forecastQty > 0);
});

test("units are scaled so that, at each product's price, they add up to the revenue forecast", async () => {
  const { forecastAll, revenueForecast } = await import("./forecast.ts");
  const jam = { ...(spread as object), id: "p2", name: "Jam" } as never;
  const sales = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].flatMap((m, i) => [priced(m, 10 + i, (10 + i) * 100), priced(m, 5, 250, "Jam")]);
  const forecasts = forecastAll([spread, jam], sales, now);
  const revenue = revenueForecast(sales, now);
  const pesos = (i: number) => forecasts.reduce((t, f) => t + f.monthly[i].units * (f.productId === "p1" ? 100 : 50), 0);
  assert.ok(Math.abs(pesos(0) - revenue[0]) < 0.01);
  assert.ok(Math.abs(pesos(5) - revenue[5]) < 0.01);
});

test("a past month's forecast uses only the sales before it", async () => {
  const { pastForecast, pastForecastMonths } = await import("./forecast.ts");
  const sales = ["2026-04", "2026-05", "2026-06"].map((m) => priced(m, 20, 200));
  const before = pastForecast("2026-06", [spread], sales);
  const withMore = pastForecast("2026-06", [spread], [...sales, priced("2026-07", 500, 5000)]);
  assert.equal(before.rows[0].forecast, withMore.rows[0].forecast); // July can't change June's forecast
  assert.equal(before.sold, 20);
  assert.deepEqual(pastForecastMonths(sales, new Date(2026, 6, 10)), ["2026-05", "2026-06", "2026-07"]);
});
