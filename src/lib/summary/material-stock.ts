/**
 * Ingredients and supplies, as the ledger says they stand.
 *
 * Two things used to be muddled here. Everything bought was one undifferentiated list of "raw
 * materials", so cocoa beans and sticker labels sat side by side although nothing about them is
 * alike — one goes in the jar and is subject to roasting loss, the other is the jar. And the
 * quantity on hand was a stored number kept up to date by hand and by increments, which is to
 * say it was right until the first time something was missed.
 *
 * Both now come from the same place as the costs: what she bought, minus what her batches used.
 */

import { valueMaterial } from "@/lib/summary/ingredient-cost";
import type { CostSource } from "@/lib/summary/ingredient-cost";
import type { Entry, MaterialKind, Product, RawMaterialStock } from "@/lib/store/types";

/** What this is in plain words: something that goes IN the jar, or something that IS the jar. */
export type MaterialGroup = "ingredient" | "supply";

const SUPPLY_WORDS = /jar|label|lid|box|pack|wrap|sachet|tray|bottle|cap|seal|sticker|bag|pouch|ribbon|tape/i;

/**
 * Her own classification wins. Rows that predate the column are read from their name, because
 * refusing to guess would leave every one of them unsorted — and a wrong guess here is visible
 * on the screen and one tap from being corrected.
 */
export function groupOf(material: RawMaterialStock): MaterialGroup {
  if (material.kind) return material.kind === "packaging" ? "supply" : "ingredient";
  return SUPPLY_WORDS.test(material.name) ? "supply" : "ingredient";
}

export function kindForGroup(group: MaterialGroup): MaterialKind {
  return group === "supply" ? "packaging" : "ingredient";
}

export interface MaterialStanding {
  material: RawMaterialStock;
  group: MaterialGroup;
  /** Bought, per the receipts, in the material's own unit. */
  purchased: number;
  /** Eaten by every batch logged, with roasting loss applied to cacao. */
  consumed: number;
  /** purchased − consumed. This is the on-hand figure the app runs on. */
  onHand: number;
  /** Weighted average of what is still on the shelf, oldest sack drawn down first. */
  avgCost: number | null;
  source: CostSource;
  /** What the stored field claims, kept only so a disagreement can be shown. */
  counted: number;
  /** Purchases in a unit that would not convert, so left out of both figures. */
  skipped: number;
  /** True once anything has been bought — before that the app knows nothing about this row. */
  tracked: boolean;
}

export function materialStanding(
  entries: Entry[],
  products: Product[],
  material: RawMaterialStock,
  cacaoUtilization: number,
): MaterialStanding {
  const v = valueMaterial(entries, products, material, cacaoUtilization);
  const tracked = v.purchased > 0;
  return {
    material,
    group: groupOf(material),
    purchased: v.purchased,
    consumed: v.consumed,
    // Nothing bought means nothing to say. Falling back to the stored number would quietly
    // reintroduce the figure this is meant to replace.
    onHand: tracked ? v.remaining : material.qty,
    avgCost: v.unitCost,
    source: v.unitCost !== null ? "transactions" : "none",
    counted: material.qty,
    skipped: v.skipped,
    tracked,
  };
}

export function allStandings(
  entries: Entry[],
  products: Product[],
  rawMaterials: RawMaterialStock[],
  cacaoUtilization: number,
): MaterialStanding[] {
  return rawMaterials.map((m) => materialStanding(entries, products, m, cacaoUtilization));
}

/** Which products use this material, so a row says what it is for. */
export function usedBy(material: RawMaterialStock, products: Product[]): Product[] {
  return products.filter((p) => p.recipeIngredients.some((r) => r.materialId === material.id));
}
