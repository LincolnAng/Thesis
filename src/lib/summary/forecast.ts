import { resolveProductId } from "@/lib/summary/product-match";
import {
  fitHoltWinters,
  forecastHoltWinters,
  measureSeasonality,
  type HoltWintersResult,
  type SeasonPoint,
} from "@/lib/summary/seasonality";
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

export type ForecastMethod = "holt_winters" | "moving_average" | "single_month" | "no_history";
export type ForecastConfidence = "none" | "low" | "medium" | "high";

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
  /** How much the forecast can be leaned on, and why. */
  reliability: ForecastReliability;
  /** The next twelve months, so Advanced can show where the number comes from. */
  monthly: ForecastMonth[];
  /** The fitted level and trend, for the same reason. */
  level: number;
  trendPerMonth: number;
}

export interface ForecastReliability {
  level: ForecastConfidence;
  /** Plain words naming the weakest link, not a score to decode. */
  reason: string;
  /** A plausible band for next month. Null when there is too little data to say. */
  range: { low: number; high: number } | null;
  /** How much the underlying monthly level bounces around, as a fraction. Null if unknown. */
  variability: number | null;
  /** 0-5, for drawing the confidence as filled dashes. */
  bars: number;
}

export interface ForecastMonth {
  /** "2026-11" */
  month: string;
  label: string;
  /** 0 = January. */
  monthIndex: number;
  /** The fitted seasonal index for this month, 1.0 being an ordinary month. */
  seasonIndex: number;
  /** Level plus trend, before the season is applied. This month's "ordinary month" figure. */
  baseline: number;
  units: number;
  /** 0-5, for this month specifically — further out and never-seen months are shakier. */
  bars: number;
  /** A plausible band for this month. Widens with how far ahead it is. */
  range: { low: number; high: number } | null;
  /** How many times this calendar month appears in her sales history. */
  observed: number;
}

export const FORECAST_METHOD_LABELS: Record<ForecastMethod, string> = {
  holt_winters: "Weighted average of past months, adjusted for season",
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

/** No pattern set: the same maths with nothing applied. */
const FLAT_MULTIPLIERS = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

/**
 * Fit Holt-Winters to the history and read the next month off it.
 *
 * Replaces an average of deseasonalised months. That treated every past month as equally
 * informative and had no way to express growth at all — two shops, one flat at 10 jars and one
 * growing 10% a month, produced the same forecast. Holt-Winters carries a level, a trend and a
 * set of seasonal indices, each weighted towards recent evidence.
 */
function projectHoltWinters(
  history: MonthlyDemandPoint[],
  multipliers: number[],
  steps: number,
): { series: number[]; fit: HoltWintersResult } {
  const points: SeasonPoint[] = history.map((p) => ({ monthIndex: monthIndexOfKey(p.month), units: p.qty }));
  const fit = fitHoltWinters(points, multipliers);
  const lastMonthIndex = points.length > 0 ? points[points.length - 1].monthIndex : 0;
  return { series: forecastHoltWinters(fit, lastMonthIndex, steps), fit };
}

/** Whole months from one "2026-07" key to another. Negative if `to` is earlier. */
function monthsBetweenKeys(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** Month index 0-11 from a "2026-07" key. */
function monthIndexOfKey(key: string): number {
  const month = Number(key.split("-")[1]);
  return Number.isFinite(month) ? Math.min(11, Math.max(0, month - 1)) : 0;
}

/**
 * Confidence for ONE month, rather than one figure for the whole product.
 *
 * A single number for all twelve months is misleading in two directions at once: next month
 * is better than the product's average, and next October is worse. Two things pull it down —
 * how far ahead the month is, and whether she has ever actually traded through that calendar
 * month before.
 */
function monthReliability(
  base: { bars: number; variability: number | null },
  units: number,
  horizon: number,
  observed: number,
): { bars: number; range: { low: number; high: number } | null } {
  if (base.bars === 0) return { bars: 0, range: null };

  // A dash off for a month she has never traded through, and one more for roughly every four
  // months further out.
  const penalty = (observed === 0 ? 1 : 0) + Math.floor((horizon - 1) / 4);
  const bars = Math.max(1, Math.min(5, base.bars - penalty));

  if (base.variability === null || units <= 0) return { bars, range: null };
  // Uncertainty compounds with distance, but not without limit.
  const widened = Math.min(0.9, base.variability * (1 + (horizon - 1) * 0.08));
  const band = Math.max(0.15, widened);
  return {
    bars,
    range: { low: Math.max(0, Math.round(units * (1 - band))), high: Math.round(units * (1 + band)) },
  };
}

/**
 * How far this forecast can be trusted, and why.
 *
 * Three things decide it, and the weakest one dominates:
 *
 *   - **How many months** of sales it was fitted on. One month is a reading, not a fit.
 *   - **Where the season came from.** Measured from her own sales is evidence; a pattern the
 *     assistant proposed is a reasonable guess about a kind of product, not about her shop.
 *   - **How steady those sales are.** A product that sells 2 jars one month and 40 the next
 *     cannot be forecast well no matter how many months there are.
 *
 * The band matters more than the label. "13 jars" invites a precision that isn't there;
 * "13 jars, likely 8-19" is the same estimate told honestly.
 */
function reliabilityOf(
  history: MonthlyDemandPoint[],
  season: number[],
  forecastQty: number,
  seasonMeasured: boolean,
): ForecastReliability {
  const months = history.length;
  if (months === 0) {
    return {
      level: "none",
      reason: "No sales logged yet, so there is nothing to forecast from.",
      range: null,
      variability: null,
      bars: 0,
    };
  }

  // Compare like with like: a busy December against a quiet February says nothing about
  // steadiness until the season is divided out of both.
  const levels = history.map((h) => h.qty / (season[monthIndexOfKey(h.month)] || 1));
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  const variability =
    months >= 3 && mean > 0
      ? Math.sqrt(levels.reduce((sum, v) => sum + (v - mean) ** 2, 0) / levels.length) / mean
      : null;

  const historyScore = months >= 12 ? 4 : months >= 6 ? 3 : months >= 3 ? 2 : 1;
  const seasonScore = seasonMeasured ? 1 : 0;
  const steadyScore = variability === null ? 0 : variability > 0.5 ? 0 : variability > 0.25 ? 1 : 2;
  const total = historyScore + seasonScore + steadyScore;

  // Volatility overrules everything else. A product that sells 2 jars one month and 40 the
  // next cannot be forecast well however many months there are, and letting a long history
  // lift it to "fair" would be the forecast flattering itself.
  const scored: ForecastConfidence = total >= 5 ? "high" : total >= 3 ? "medium" : "low";
  const level: ForecastConfidence =
    variability !== null && variability > 0.5
      ? "low"
      : variability !== null && variability > 0.35 && scored === "high"
        ? "medium"
        : scored;

  let reason: string;
  if (variability !== null && variability > 0.5) {
    reason = `Your sales swing a lot month to month, so any single month is hard to call — even with ${months} months on record.`;
  } else if (months < 3) {
    reason = `Only ${months} month${months === 1 ? "" : "s"} of sales — the shape comes from the busy-months pattern, not from your own figures yet.`;
  } else if (!seasonMeasured) {
    reason = `${months} months of sales, but the busy-months pattern is still an estimate rather than measured from them.`;
  } else {
    reason = `${months} months of your own sales, and they have been fairly steady.`;
  }

  // Below three months there is no spread to measure, so the band would be invented. Say
  // nothing rather than draw a confident-looking range around a guess.
  const band = variability === null ? null : Math.min(0.8, Math.max(0.15, variability));
  const range =
    band === null || forecastQty <= 0
      ? null
      : { low: Math.max(0, Math.round(forecastQty * (1 - band))), high: Math.round(forecastQty * (1 + band)) };

  // Five dashes, so the strength reads at a glance without a legend. The level caps it:
  // a volatile product cannot show four dashes just because it has a long history.
  const cap = level === "low" ? 2 : level === "medium" ? 3 : 5;
  const bars = Math.min(cap, Math.max(1, Math.round((total / 7) * 5)));

  return { level, reason, range, variability, bars };
}

export function forecastProduct(
  product: Product,
  entries: Entry[],
  products: Product[],
  now = new Date(),
  /** Twelve seasonal multipliers for this product. Omitted means no seasonality is applied. */
  multipliers?: number[],
): ProductForecast {
  const history = monthlyDemand(product.id, entries, products, now);

  // One estimator, always. Seasonality is a multiplier ON this forecast, never a different
  // way of producing it — so turning a pattern on changes the shape across the year and
  // leaves the underlying level alone.
  //
  // Where the starting indices come from matters more than it looks. Starting them flat and
  // hoping the fit discovers the season does not work: the level moves faster than the
  // seasonal terms (alpha 0.3 against gamma 0.2), so it absorbs a December spike before the
  // December index can learn it — fed a true 1.65 December, a flat start only reached 1.06.
  // So with a full year on record the indices are seeded from her own sales, which is how
  // Holt-Winters is normally initialised, and the fit refines from there.
  const measured = measureSeasonality(
    monthlyDemand(product.id, entries, products, now).map((h) => ({
      monthIndex: monthIndexOfKey(h.month),
      units: h.qty,
    })),
  );
  const season =
    multipliers && multipliers.length === 12
      ? multipliers
      : measured.usable
        ? measured.months
        : FLAT_MULTIPLIERS;

  let qty = 0;
  let method: ForecastMethod = "no_history";
  let monthly: ForecastMonth[] = [];
  let level = 0;
  let trendPerMonth = 0;

  if (history.length > 0) {
    const lastHistoryMonth = history[history.length - 1].month;
    const thisMonth = currentMonthKey(now);
    // Holt-Winters projects from the LAST OBSERVED month, which is not necessarily last
    // month — history can stop short or have a gap. series[0] is the month after the last
    // observation, so this month sits at index (gap - 1).
    const offset = Math.max(0, monthsBetweenKeys(lastHistoryMonth, thisMonth) - 1);

    const { series, fit } = projectHoltWinters(history, season, offset + 13);
    level = fit.level;
    trendPerMonth = fit.trend;
    qty = series[offset + 1] ?? 0;
    // One month of sales is a reading, not a fit. Say so rather than dressing it up.
    method = history.length === 1 ? "single_month" : "holt_winters";

    // How often each calendar month actually appears in her history. A December she has never
    // traded through is a weaker prediction than a June she has seen twice, however good the
    // overall fit is.
    // Only months she actually sold in count. monthlyDemand fills gaps with zero so the fit
    // sees an unbroken series, and those zeros are indistinguishable from a month she simply
    // never logged — so treating them as evidence would let a gap in her records pass for
    // knowledge. Counting sales only understates confidence, which is the safe direction.
    const seenPerMonth = Array(12).fill(0);
    for (const h of history) if (h.qty > 0) seenPerMonth[monthIndexOfKey(h.month)] += 1;

    const seed = reliabilityOf(history, season, Math.round(qty), measured.usable);
    let cursor = thisMonth;
    monthly = series.slice(offset, offset + 12).map((units, i) => {
      const monthIndex = monthIndexOfKey(cursor);
      const horizon = i + 1;
      const observed = seenPerMonth[monthIndex];
      const point: ForecastMonth = {
        month: cursor,
        label: monthLabel(cursor),
        monthIndex,
        seasonIndex: fit.seasonal[monthIndex] ?? 1,
        baseline: fit.level + (offset + i + 1) * fit.trend,
        units,
        ...monthReliability(seed, units, horizon, observed),
        observed,
      };
      cursor = nextMonthKey(cursor);
      return point;
    });
  }

  const forecastQty = Math.round(qty);
  // `measured.usable` is the honest test of whether the season rests on her sales: a stored
  // "measured" pattern came from this same data, and a stored suggestion did not.
  const reliability = reliabilityOf(history, season, forecastQty, measured.usable);
  return {
    productId: product.id,
    productName: product.name,
    history,
    monthsOfHistory: history.length,
    forecastQty,
    method,
    confidence: reliability.level,
    reliability,
    currentStock: product.stockQty,
    suggestedProduction: Math.max(0, forecastQty - product.stockQty),
    stockCover: forecastQty > 0 ? product.stockQty / forecastQty : 1,
    monthly,
    level,
    trendPerMonth,
  };
}

export function forecastAll(
  products: Product[],
  entries: Entry[],
  now = new Date(),
  /** Per-product seasonal multipliers, keyed by product id. Missing ids stay unseasonal. */
  multipliersFor?: (productId: string) => number[] | undefined,
): ProductForecast[] {
  return products
    .map((p) => forecastProduct(p, entries, products, now, multipliersFor?.(p.id)))
    .sort((a, b) => a.stockCover - b.stockCover || b.forecastQty - a.forecastQty);
}
