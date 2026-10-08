/**
 * What an ingredient actually costs, from what was actually paid for it.
 *
 * Costing used to run off two numbers the owner had to maintain by hand: a supplier price list
 * she had to remember to update, and a `unitCost` field on the material itself. Her expenses —
 * the one record that is true because the money left her account — were shown beside them as a
 * "suggestion" she could copy across. So the cost of a jar depended on how recently she had
 * done some bookkeeping, not on what the beans cost.
 *
 * This reads the purchases instead, and values what is left on the shelf:
 *
 *   FIFO drawdown — the oldest sack is used first, because that is what happens in a kitchen.
 *   Weighted average of the REMAINDER — the jars she makes tomorrow are made from the beans
 *   still in the room, so last year's cheap sack should not be averaged into them once it has
 *   been used up.
 *
 * That combination is deliberate. Pure weighted-average-of-everything-ever lets a price she
 * paid two years ago hold her costs down forever. Pure latest-price swings her margins on a
 * single unusual receipt. FIFO-then-average prices the shelf as it stands.
 *
 * Pure: no store, no React.
 */

import { convertQuantity } from "@/lib/units";
import { rawQuantityNeeded } from "@/lib/summary/cacao";
import type { Entry, Product, RawMaterialStock } from "@/lib/store/types";

/** One purchase, in the material's own unit. */
export interface CostLayer {
  date: string;
  qty: number;
  unitCost: number;
}

export type CostSource = "transactions" | "supplier" | "stored" | "none";

export interface MaterialValuation {
  /** Weighted average cost of what is still on hand. Null when nothing was ever bought. */
  unitCost: number | null;
  purchased: number;
  consumed: number;
  /** Purchased − consumed, floored at zero. */
  remaining: number;
  /** The layers still on the shelf, oldest first. */
  layers: CostLayer[];
  /** Purchases that could not be converted to the material's unit, so were left out. */
  skipped: number;
}

function normalise(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

/**
 * Purchases of one material, oldest first, converted into the material's own unit.
 *
 * A receipt logged in sacks and a recipe written in kilos have to meet somewhere, and it has
 * to be here — averaging ₱1,800 a sack with ₱320 a kilo produces a number that means nothing.
 * Anything that will not convert is counted in `skipped` rather than silently folded in.
 */
export function purchaseLayers(
  entries: Entry[],
  material: RawMaterialStock,
): { layers: CostLayer[]; skipped: number } {
  const name = normalise(material.name);
  if (!name) return { layers: [], skipped: 0 };

  const layers: CostLayer[] = [];
  let skipped = 0;

  for (const entry of entries) {
    if (entry.type !== "EXPENSE") continue;
    if (!entry.quantity || !entry.amount || entry.quantity <= 0 || entry.amount <= 0) continue;
    if (normalise(entry.sku) !== name) continue;

    const qty = convertQuantity(entry.quantity, entry.unit ?? material.unit, material.unit);
    if (qty === null || qty <= 0) {
      skipped += 1;
      continue;
    }
    layers.push({ date: entry.timestamp, qty, unitCost: entry.amount / qty });
  }

  layers.sort((a, b) => a.date.localeCompare(b.date));
  return { layers, skipped };
}

/**
 * How much of a material production has eaten, across every batch ever logged.
 *
 * Read from the batch entries rather than from a running total, for the same reason the cost
 * is read from receipts: a stored figure is only as good as the last time something remembered
 * to update it.
 */
export function consumedQty(
  entries: Entry[],
  products: Product[],
  material: RawMaterialStock,
  cacaoUtilization: number,
): number {
  let used = 0;
  for (const entry of entries) {
    if (entry.type !== "INVENTORY_IN" || !entry.quantity || entry.quantity <= 0) continue;
    const product = products.find((p) => normalise(p.name) === normalise(entry.sku));
    if (!product || product.batchYield <= 0) continue;
    const row = product.recipeIngredients.find((r) => r.materialId === material.id);
    if (!row) continue;
    const batches = entry.quantity / product.batchYield;
    used += rawQuantityNeeded(material.name, row.quantity, cacaoUtilization) * batches;
  }
  return used;
}

/** Draw `amount` off the front of the layers, oldest first. Returns what is left. */
function drawDown(layers: CostLayer[], amount: number): CostLayer[] {
  let left = amount;
  const out: CostLayer[] = [];
  for (const layer of layers) {
    if (left <= 0) {
      out.push(layer);
      continue;
    }
    if (left >= layer.qty) {
      left -= layer.qty;
      continue; // this layer is entirely used up
    }
    out.push({ ...layer, qty: layer.qty - left });
    left = 0;
  }
  return out;
}

export function valueMaterial(
  entries: Entry[],
  products: Product[],
  material: RawMaterialStock,
  cacaoUtilization: number,
): MaterialValuation {
  const { layers, skipped } = purchaseLayers(entries, material);
  const purchased = layers.reduce((sum, l) => sum + l.qty, 0);
  const consumed = consumedQty(entries, products, material, cacaoUtilization);
  const left = drawDown(layers, consumed);
  const remaining = left.reduce((sum, l) => sum + l.qty, 0);

  // Everything bought has been used. The shelf is empty on paper, so the honest price for the
  // NEXT jar is what the last sack cost, not an average of sacks that no longer exist.
  if (remaining <= 0) {
    const last = layers[layers.length - 1];
    return {
      unitCost: last ? last.unitCost : null,
      purchased,
      consumed,
      remaining: 0,
      layers: [],
      skipped,
    };
  }

  const value = left.reduce((sum, l) => sum + l.qty * l.unitCost, 0);
  return { unitCost: value / remaining, purchased, consumed, remaining, layers: left, skipped };
}
