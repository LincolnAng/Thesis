/**
 * Seasonal shape per product, owner-editable.
 *
 * Demand here is not flat across the year — jarred spreads sell hardest at Christmas, and a
 * seasonal line like ice cream or a brandy product peaks somewhere else entirely. The forecast
 * used to average the last three months and project that forward, which meant December was
 * forecast from September and came out far too low, while January was forecast from December
 * and came out far too high.
 *
 * A profile is twelve multipliers, January first, where 1.0 means an average month. Products
 * point at a profile by name, so adding a seasonal line is a settings change rather than a code
 * change — which is the whole point: the owner knows her seasons, the code does not.
 */

/** Twelve multipliers, January first. 1.0 is an average month. */
export type SeasonProfiles = Record<string, number[]>;

export const FLAT_PROFILE = "flat";

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Starting points, offered until the owner edits them. Every one is a guess about her business
 * and is labelled as such in the UI — twelve months of her own sales should replace them.
 */
export const SEEDED_PROFILES: SeasonProfiles = {
  [FLAT_PROFILE]: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  "Spread (Christmas lift)": [0.85, 0.85, 0.9, 0.9, 0.9, 1.0, 1.0, 0.95, 1.05, 1.15, 1.3, 1.65],
  "Ice cream (ber months)": [0.8, 0.8, 0.95, 1.1, 1.2, 0.9, 0.8, 0.85, 1.15, 1.25, 1.35, 1.35],
  "Brandy (December)": [0.7, 0.7, 0.75, 0.75, 0.75, 0.8, 0.8, 0.85, 0.95, 1.1, 1.6, 2.25],
  "Baon (school year)": [0.8, 1.05, 1.0, 0.7, 0.7, 1.35, 1.3, 1.15, 1.05, 1.0, 0.95, 0.95],
};

export function normaliseProfile(values: unknown): number[] | null {
  if (!Array.isArray(values) || values.length !== 12) return null;
  const nums = values.map((v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 1));
  return nums;
}

/** Every usable profile, falling back to the seeded set when nothing is stored yet. */
export function resolveProfiles(stored: SeasonProfiles): SeasonProfiles {
  const out: SeasonProfiles = {};
  for (const [name, values] of Object.entries(Object.keys(stored).length > 0 ? stored : SEEDED_PROFILES)) {
    const clean = normaliseProfile(values);
    if (clean) out[name] = clean;
  }
  if (!out[FLAT_PROFILE]) out[FLAT_PROFILE] = [...SEEDED_PROFILES[FLAT_PROFILE]];
  return out;
}

/** The twelve multipliers for a named profile. Unknown names fall back to flat. */
export function multipliersFrom(profiles: SeasonProfiles, profileName: string): number[] {
  return profiles[profileName] ?? profiles[FLAT_PROFILE] ?? [...SEEDED_PROFILES[FLAT_PROFILE]];
}

/** Month index 0-11 from an ISO date or a Date. */
export function monthIndexOf(value: string | Date): number {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.getMonth();
}

/**
 * Take the season out of an observed figure, recovering the underlying level.
 * 17 jars sold in a 1.65 December is a level of about 10, not 17.
 */
export function deseasonalise(units: number, multipliers: number[], monthIndex: number): number {
  const m = multipliers[monthIndex] ?? 1;
  return m > 0 ? units / m : units;
}

/** Put the season back on, turning an underlying level into an expected month. */
export function reseasonalise(level: number, multipliers: number[], monthIndex: number): number {
  return level * (multipliers[monthIndex] ?? 1);
}

/**
 * How far a profile's average is from 1.0, as a fraction.
 *
 * A profile averaging 1.3 is not describing seasonality, it is describing growth — and because
 * the forecast multiplies by it every month, that growth would be applied twice. The settings
 * screen warns above this threshold rather than silently correcting, because the owner's own
 * numbers are more trustworthy than an automatic rescale.
 */
export function profileDrift(multipliers: number[]): number {
  const mean = multipliers.reduce((sum, m) => sum + m, 0) / (multipliers.length || 1);
  return mean - 1;
}

export const DRIFT_WARN_THRESHOLD = 0.1;

// --- Holt-Winters -----------------------------------------------------------------
//
// Triple exponential smoothing: a level, a trend and a set of seasonal indices, each
// updated on every observation. It replaces "divide the season out, average, put it back",
// which treated every past month as equally informative and could not represent growth at
// all — a shop selling 10 jars a month and a shop growing 10% a month got the same forecast.
//
// The multiplicative form is used because seasonality here is proportional: a busy December
// sells half as much again, not thirty more jars.
//
// The owner's own pattern seeds the seasonal indices. That matters more than it looks: it is
// what lets the model produce a sensible December from a few months of data, and it means her
// knowledge is the starting point that evidence then corrects, rather than something the maths
// has to rediscover from scratch.

export interface HoltWintersOptions {
  /** How fast the level follows new observations. */
  alpha: number;
  /** How fast the trend follows changes in the level. */
  beta: number;
  /** How fast the seasonal indices follow new observations. */
  gamma: number;
}

/** Deliberately gentle. With a handful of noisy months, fast adaptation just chases noise. */
export const DEFAULT_HW: HoltWintersOptions = { alpha: 0.3, beta: 0.1, gamma: 0.2 };

/** Enough observations for the trend term to mean anything. Below this, trend is held at 0. */
export const HW_MIN_FOR_TREND = 6;

export interface HoltWintersResult {
  level: number;
  trend: number;
  /** Seasonal indices, January first, after fitting. */
  seasonal: number[];
  /** Observations actually used. */
  used: number;
}

export interface SeasonPoint {
  /** 0 = January. */
  monthIndex: number;
  units: number;
}

/**
 * Fit level, trend and seasonal indices to a series of monthly observations.
 *
 * `seasonalInit` is the owner's pattern — used as the starting seasonal indices and refined
 * from there. With no observations it is returned unchanged, which is the honest answer: her
 * pattern is all the information there is.
 */
export function fitHoltWinters(
  series: SeasonPoint[],
  seasonalInit: number[],
  options: HoltWintersOptions = DEFAULT_HW,
): HoltWintersResult {
  const seasonal = [...(normaliseProfile(seasonalInit) ?? SEEDED_PROFILES[FLAT_PROFILE])];
  if (series.length === 0) return { level: 0, trend: 0, seasonal, used: 0 };

  const { alpha, beta, gamma } = options;
  // Start the level at the first observation with its season removed, so a series that happens
  // to begin in December doesn't start the level 65% too high.
  const first = series[0];
  let level = first.units / (seasonal[first.monthIndex] || 1);
  let trend = 0;
  const allowTrend = series.length >= HW_MIN_FOR_TREND;

  for (let i = 1; i < series.length; i++) {
    const { monthIndex, units } = series[i];
    const season = seasonal[monthIndex] || 1;
    const prevLevel = level;

    level = alpha * (units / season) + (1 - alpha) * (level + trend);
    if (allowTrend) trend = beta * (level - prevLevel) + (1 - beta) * trend;
    // Guard the division: a month that sold nothing would otherwise drive the index to zero
    // and permanently flatten that month for every future year.
    if (level > 0) seasonal[monthIndex] = gamma * (units / level) + (1 - gamma) * season;
  }

  return { level: Math.max(0, level), trend: allowTrend ? trend : 0, seasonal, used: series.length };
}

/**
 * Project `steps` months beyond the last observation.
 * `fromMonthIndex` is the month of that last observation.
 */
export function forecastHoltWinters(
  fit: HoltWintersResult,
  fromMonthIndex: number,
  steps: number,
): number[] {
  const out: number[] = [];
  for (let h = 1; h <= steps; h++) {
    const monthIndex = (fromMonthIndex + h) % 12;
    const base = fit.level + h * fit.trend;
    out.push(Math.max(0, base * (fit.seasonal[monthIndex] || 1)));
  }
  return out;
}

// --- Working the pattern out --------------------------------------------------------
//
// The owner should not have to tell the app which months are busy. She is the one asking
// that question. So the pattern is either measured from her own sales, or proposed by the
// assistant with its reasoning shown — and picking one from a dropdown is only ever an
// override, never the starting point.

/**
 * Where a product's pattern came from. "legacy" is a profile name picked from a dropdown that
 * no longer exists — it looks like a deliberate choice but was never an informed one, so the
 * app is free to work out a better answer over the top of it. A real "manual" edit is not.
 */
export type PatternSource = "measured" | "suggested" | "manual" | "legacy" | "none";

export interface ProductPattern {
  /** Twelve multipliers, January first. */
  months: number[];
  source: PatternSource;
  /** Why these numbers, in the owner's words. Shown wherever the pattern is used. */
  reason: string;
  /** How many distinct calendar months the measurement had data for. 0 when not measured. */
  monthsCovered: number;
  updatedAt: string;
}

/** A full year of data before a measured pattern is trusted over a suggested one. */
export const MEASURE_MIN_MONTHS = 12;

export interface Measured {
  months: number[];
  monthsCovered: number;
  /** True when there was enough history to be worth using. */
  usable: boolean;
}

/**
 * Seasonal indices straight from the owner's own sales.
 *
 * Each calendar month's average sales divided by the average across all months — so a
 * December averaging 17 against an all-month average of 10 comes out at 1.7. Months with no
 * data stay at 1.0 rather than being invented, and the result is rescaled to average 1.0 so
 * it describes shape only; growth is the trend term's job, not the season's.
 */
export function measureSeasonality(points: SeasonPoint[]): Measured {
  const sums = Array(12).fill(0);
  const counts = Array(12).fill(0);
  for (const p of points) {
    if (p.monthIndex < 0 || p.monthIndex > 11) continue;
    sums[p.monthIndex] += p.units;
    counts[p.monthIndex] += 1;
  }

  const monthsCovered = counts.filter((c) => c > 0).length;
  const averages = sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : null));
  const present = averages.filter((a): a is number => a !== null && a > 0);
  const overall = present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : 0;

  if (overall <= 0 || monthsCovered < MEASURE_MIN_MONTHS) {
    return { months: [...SEEDED_PROFILES[FLAT_PROFILE]], monthsCovered, usable: false };
  }

  const raw = averages.map((a) => (a === null ? 1 : a / overall));
  // Rescale so the twelve average exactly 1.0 — otherwise a year of growth would be baked
  // into the seasonal indices and then applied again by the trend.
  const mean = raw.reduce((a, b) => a + b, 0) / 12;
  const months = mean > 0 ? raw.map((v) => v / mean) : raw;
  return { months, monthsCovered, usable: true };
}

/** A plain-words description of a pattern, for the owner to sanity-check against her memory. */
export function describePattern(months: number[]): string {
  const best = months.indexOf(Math.max(...months));
  const worst = months.indexOf(Math.min(...months));
  const peak = months[best];
  if (peak < 1.1) return "About the same all year.";
  const busiest = `${MONTH_LABELS[best]} is your busiest month, about ${peak.toFixed(1)}× an ordinary one`;
  const quietest = months[worst] < 0.9 ? `; ${MONTH_LABELS[worst]} is the quietest` : "";
  return `${busiest}${quietest}.`;
}

/** A month's seasonal strength in words and on a 1-7 scale. */
export interface SeasonStrength {
  /** 1 = the leanest kind of month, 4 = exactly ordinary, 7 = the strongest. */
  score: number;
  word: "VERY LEAN" | "LEAN" | "SLIGHTLY LEAN" | "NORMAL" | "SLIGHTLY STRONG" | "STRONG" | "VERY STRONG";
}

const SEASON_WORDS: SeasonStrength["word"][] = [
  "VERY LEAN",
  "LEAN",
  "SLIGHTLY LEAN",
  "NORMAL",
  "SLIGHTLY STRONG",
  "STRONG",
  "VERY STRONG",
];

/**
 * Turn a seasonal multiplier into something readable.
 *
 * "1.27x" is precise and tells the owner nothing she can act on — she has to hold "1.0 is
 * ordinary" in her head and do the comparison herself, every row. A word plus a rung on a
 * fixed seven-point ladder says the same thing at a glance, and because the ladder is fixed
 * rather than scaled per product, a 6 means the same for every product she sells.
 *
 * The bands are symmetric about 1.0, so a month selling a third more and a month selling a
 * third less sit the same distance either side of NORMAL.
 */
export function seasonStrength(multiplier: number): SeasonStrength {
  const m = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const score =
    m < 0.6 ? 1
    : m < 0.78 ? 2
    : m < 0.92 ? 3
    : m < 1.08 ? 4
    : m < 1.22 ? 5
    : m < 1.4 ? 6
    : 7;
  return { score, word: SEASON_WORDS[score - 1] };
}
