/**
 * What spoiled stock was worth.
 *
 * Raw materials and finished goods are written off differently, and the difference is not a
 * style choice — it follows from where the money still is.
 *
 * A spoiled sack of beans is written off by RE-AVERAGING: the pesos spent on it stay in the
 * ingredient pool and land on the sacks that survived, so the next jar costs more. Nothing
 * needs to be booked, because the cost never left.
 *
 * A spoiled JAR has no pool to land in. The ingredients were already turned into a thing that
 * is now in the bin, and nothing that remains can absorb their cost. So it is recorded in
 * pesos, at what the jar cost to make on the day it was written off.
 */

import { productCostPerJar, type CostContext } from "@/lib/summary/recipe-cost";
import type { Entry, Product } from "@/lib/store/types";

export function findProductByName(products: Product[], sku: string | null | undefined): Product | undefined {
  const name = (sku ?? "").trim().toLowerCase();
  if (!name) return undefined;
  return products.find((p) => p.name.trim().toLowerCase() === name);
}

/**
 * The cost of one spoilage entry, or null when it is not a finished product.
 *
 * Priced at the time of writing off and then stored on the entry, so a loss recorded in June
 * does not change in September because bean prices did. A historical loss that moves is not a
 * record of anything.
 */
export function spoiledValue(
  sku: string | null | undefined,
  quantity: number | null | undefined,
  products: Product[],
  ctx: CostContext,
): number | null {
  const product = findProductByName(products, sku);
  if (!product || !quantity || quantity <= 0) return null;
  const cost = productCostPerJar(product, ctx);
  // A recipe that cannot be fully priced cannot value its own loss either. Saying nothing is
  // better than booking a loss that is missing half its ingredients.
  if (cost.unpriced.length > 0 || cost.costPerJar <= 0) return null;
  return Math.round(cost.costPerJar * quantity * 100) / 100;
}

/** Everything written off in pesos over a set of entries. */
export function spoilageLoss(entries: Entry[]): number {
  return entries
    .filter((e) => e.type === "WASTE" && e.category !== "material_waste" && e.amount && e.amount > 0)
    .reduce((sum, e) => sum + (e.amount as number), 0);
}
