/**
 * The measurement units offered everywhere a quantity is entered — the chat's quick-edit
 * form, sales/expense/stock entries, and ingredient setup. Free text used to be the only
 * option, which is how a 250ml sale ended up recorded as a bare "1 unit".
 */
export interface UnitGroup {
  group: string;
  units: string[];
}

export const UNIT_GROUPS: UnitGroup[] = [
  { group: "Count", units: ["pcs", "jars", "bottles", "tubs", "cups", "pints", "packs", "boxes", "trays", "sachets"] },
  { group: "Volume", units: ["ml", "L"] },
  { group: "Weight", units: ["g", "kg"] },
];

export const ALL_UNITS: string[] = UNIT_GROUPS.flatMap((g) => g.units);

/** Spellings people actually type (or the AI returns) mapped to the canonical unit above. */
const UNIT_ALIASES: Record<string, string> = {
  piece: "pcs", pieces: "pcs", pc: "pcs", pieza: "pcs", unit: "pcs", units: "pcs",
  jar: "jars", bote: "bottles", bottle: "bottles", tub: "tubs", cup: "cups", pint: "pints",
  pack: "packs", pouch: "packs", box: "boxes", tray: "trays", sachet: "sachets", sachets: "sachets",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml", mls: "ml", cc: "ml",
  liter: "L", liters: "L", litre: "L", litres: "L", l: "L", lit: "L",
  gram: "g", grams: "g", gr: "g", grm: "g",
  kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg", kilo_gram: "kg",
};

/**
 * Maps a free-text unit onto one of the canonical options, case-insensitively. Returns the
 * original trimmed text when there's no match, so an unusual unit the owner genuinely wants
 * is never silently discarded — it just won't be one of the dropdown presets.
 */
export function normalizeUnit(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const exact = ALL_UNITS.find((u) => u.toLowerCase() === lower);
  if (exact) return exact;
  return UNIT_ALIASES[lower] ?? text;
}

/**
 * How many of a base unit one of each unit is worth, within its own group. Cross-group
 * conversion is impossible (kg to pcs depends on the item), so it returns null rather than
 * inventing a factor — a supplier price logged in the wrong kind of unit must be visible
 * as unusable, not silently turned into a number.
 */
const UNIT_FACTORS: Record<string, { group: string; perBase: number }> = {
  g: { group: "weight", perBase: 1 },
  kg: { group: "weight", perBase: 1000 },
  ml: { group: "volume", perBase: 1 },
  L: { group: "volume", perBase: 1000 },
};

/** Converts a quantity between units of the same measurement family. */
export function convertQuantity(quantity: number, from: string | null, to: string | null): number | null {
  const fromUnit = normalizeUnit(from);
  const toUnit = normalizeUnit(to);
  if (!fromUnit || !toUnit) return null;
  if (fromUnit === toUnit) return quantity;

  const a = UNIT_FACTORS[fromUnit];
  const b = UNIT_FACTORS[toUnit];
  // Count units (pcs, jars, boxes) have no ratio between them — a box is not n jars by
  // definition — so only an exact match counts, which the check above already handled.
  if (!a || !b || a.group !== b.group) return null;
  return (quantity * a.perBase) / b.perBase;
}
