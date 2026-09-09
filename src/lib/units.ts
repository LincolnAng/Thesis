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
