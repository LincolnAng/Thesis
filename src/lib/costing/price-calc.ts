import { MAX_MARGIN_PCT, priceFromMargin, priceFromMarkup } from "@/lib/summary/pricing-methods";

/**
 * The per-product price calculator's arithmetic. Pure, so the preview and the tests agree.
 *
 *   Markup %       = (price − cost) ÷ cost × 100
 *   Gross margin % = (price − cost) ÷ price × 100
 *   Profit / unit  = price − cost
 *
 * A figure that would divide by zero comes back null — "can't say" — never Infinity or NaN.
 */

export type CalcMode = "price" | "markup" | "margin";

export interface CalcResult {
  price: number | null;
  cost: number | null;
  markupPct: number | null;
  marginPct: number | null;
  profit: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Selling price from what was typed, in whichever way it was typed. Null when it can't be worked out. */
export function priceFor(mode: CalcMode, value: number, cost: number | null): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  if (mode === "price") return round2(value);
  if (cost == null || cost <= 0) return null; // a markup or margin needs a known cost
  if (mode === "markup") return round2(priceFromMarkup(cost, value));
  if (value >= 100) return null; // no price gives a 100% margin
  return round2(priceFromMargin(cost, Math.min(value, MAX_MARGIN_PCT)));
}

export function evaluate(price: number | null, cost: number | null): CalcResult {
  const known = (n: number | null): n is number => n != null && Number.isFinite(n);
  return {
    price,
    cost,
    profit: known(price) && known(cost) ? round2(price - cost) : null,
    markupPct: known(price) && known(cost) && cost > 0 ? round2(((price - cost) / cost) * 100) : null,
    marginPct: known(price) && known(cost) && price > 0 ? round2(((price - cost) / price) * 100) : null,
  };
}

/**
 * Cost per finished unit = batch cost ÷ units a batch makes. Null when the batch makes nothing
 * (no division by zero) or when part of the recipe has no cost yet (an incomplete cost would
 * look like a real one and flatter every margin built on it).
 */
export function costPerUnit(batchTotal: number, unitsPerBatch: number, complete: boolean): number | null {
  if (!complete || !(unitsPerBatch > 0)) return null;
  return round2(batchTotal / unitsPerBatch);
}
