import { resolveProductId } from "@/lib/summary/product-match";
import type { Entry, Product } from "@/lib/store/types";

/**
 * Demand forecasting from past sales: a moving average of the last few complete months.
 *
 * Next month is expected to sell what the recent months sold on average. It's simple on
 * purpose — with a handful of months on record, fitting a trend line mostly fits the noise —
 * and it's easy for the owner to check by hand against the Transactions list.
 *
 * The month in progress is never averaged in: it's partial by definition, and including it
 * would drag every forecast down as a month begins.
 */

/** How many recent complete months the moving average spans. */
export const MOVING_AVERAGE_MONTHS = 3;

export type ForecastMethod = "moving_average" | "single_month" | "no_history";
export type ForecastConfidence = "none" | "low" | "medium";

export interface MonthlyDemandPoint {
  month: string; // "2026-07"
  label: string; // "Jul"
  qty: number;
}

export interface ProductForecast {
  productId: string;
  productName: string;
  history: MonthlyDemandPoint[];
  monthsOfHistory: number;
  forecastQty: number;
  method: ForecastMethod;
  confidence: ForecastConfidence;
  currentStock: number;
  /** How many more to have ready — the forecast minus what's already on the shelf. */
  suggestedProduction: number;
  /** Fraction of next month's forecast the current stock already covers, 0-1+. */
  stockCover: number;
}

export const FORECAST_METHOD_LABELS: Record<ForecastMethod, string> = {
  moving_average: `${MOVING_AVERAGE_MONTHS}-month moving average`,
  single_month: "one month of sales",
  no_history: "no sales yet",
};

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleString("en-US", { month: "short" });
}

/** Steps one month at a time so gaps between sales months become explicit zeros. */
function nextMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function nextMonthLabel(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Units sold per calendar month for one product, zero-filled from its first sale onward.
 * A month with no sales is real information — demand was zero — but months before the
 * product existed are not, so the series starts at its first sale rather than at the
 * beginning of the business.
 */
export function monthlyDemand(productId: string, entries: Entry[], products: Product[], now = new Date()): MonthlyDemandPoint[] {
  const thisMonth = currentMonthKey(now);
  const byMonth = new Map<string, number>();

  for (const entry of entries) {
    if (entry.type !== "SALE" || !entry.quantity) continue;
    if (resolveProductId(products, entry.sku) !== productId) continue;
    const key = monthKey(entry.timestamp);
    if (key >= thisMonth) continue; // the month in progress is incomplete — never fit on it
    byMonth.set(key, (byMonth.get(key) ?? 0) + entry.quantity);
  }

  if (byMonth.size === 0) return [];

  const keys = [...byMonth.keys()].sort();
  const points: MonthlyDemandPoint[] = [];
  for (let key = keys[0]; key <= keys[keys.length - 1]; key = nextMonthKey(key)) {
    points.push({ month: key, label: monthLabel(key), qty: byMonth.get(key) ?? 0 });
  }
  return points;
}

/** Average of the most recent complete months (up to MOVING_AVERAGE_MONTHS). */
function projectNextMonth(values: number[]): { qty: number; method: ForecastMethod } {
  if (values.length === 0) return { qty: 0, method: "no_history" };
  if (values.length === 1) return { qty: values[0], method: "single_month" };
  const recent = values.slice(-MOVING_AVERAGE_MONTHS);
  return { qty: recent.reduce((a, b) => a + b, 0) / recent.length, method: "moving_average" };
}

function confidenceFor(monthsOfHistory: number): ForecastConfidence {
  if (monthsOfHistory === 0) return "none";
  return monthsOfHistory >= MOVING_AVERAGE_MONTHS ? "medium" : "low";
}

export function forecastProduct(product: Product, entries: Entry[], products: Product[], now = new Date()): ProductForecast {
  const history = monthlyDemand(product.id, entries, products, now);
  const { qty, method } = projectNextMonth(history.map((p) => p.qty));
  const forecastQty = Math.round(qty);
  return {
    productId: product.id,
    productName: product.name,
    history,
    monthsOfHistory: history.length,
    forecastQty,
    method,
    confidence: confidenceFor(history.length),
    currentStock: product.stockQty,
    suggestedProduction: Math.max(0, forecastQty - product.stockQty),
    stockCover: forecastQty > 0 ? product.stockQty / forecastQty : 1,
  };
}

export function forecastAll(products: Product[], entries: Entry[], now = new Date()): ProductForecast[] {
  return products
    .map((p) => forecastProduct(p, entries, products, now))
    .sort((a, b) => a.stockCover - b.stockCover || b.forecastQty - a.forecastQty);
}
