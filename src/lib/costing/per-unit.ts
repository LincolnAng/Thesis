import type { Product } from "@/lib/store/types";

/**
 * Costing is done per unit — per jar, per pack — because batches vary: one day's batch makes 18
 * jars, the next 25, and a cost "per batch" would be a different number every time.
 *
 * The recipe is still stored as one batch's worth, because production plans in batches and the
 * stock ledger draws a batch's ingredients when one is logged. Only the ratio matters to cost,
 * so the costing screens show and edit every amount per unit, and these convert between the
 * two. A product with no batch size yet counts its batch as one unit, so its recipe is simply
 * per unit until a batch size is set for production.
 *
 * Pure: no store, no React.
 */

/** How many units the stored recipe is for. */
export function unitsPerBatch(p: Product): number {
  return p.batchYield > 0 ? p.batchYield : 1;
}

/** A stored, per-batch amount as an amount for one unit. */
export function perUnit(p: Product, batchAmount: number): number {
  return Math.round((batchAmount / unitsPerBatch(p)) * 10000) / 10000;
}

/** An amount for one unit as the stored, per-batch amount. */
export function perBatch(p: Product, unitAmount: number): number {
  return unitAmount * unitsPerBatch(p);
}

/**
 * Changes the usual batch size without changing any cost: every per-batch amount in the recipe
 * (ingredients, things made in-house, minutes, a typed labor cost, other costs) scales with it,
 * so each one stays the same per unit.
 */
export function withBatchSize(p: Product, size: number): Partial<Product> {
  if (!(size > 0)) return { batchYield: 0 };
  const k = size / unitsPerBatch(p);
  const scale = (n: number) => Math.round(n * k * 10000) / 10000;
  return {
    batchYield: size,
    recipeIngredients: p.recipeIngredients.map((r) => ({ ...r, quantity: scale(r.quantity) })),
    recipeComponents: (p.recipeComponents ?? []).map((r) => ({ ...r, quantity: scale(r.quantity) })),
    recipeMisc: p.recipeMisc.map((r) => ({ ...r, cost: scale(r.cost) })),
    minutesPerBatch: p.minutesPerBatch != null ? scale(p.minutesPerBatch) : p.minutesPerBatch,
    laborCostOverride: p.laborCostOverride != null ? scale(p.laborCostOverride) : p.laborCostOverride,
  };
}
