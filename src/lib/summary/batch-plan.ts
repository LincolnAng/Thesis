import { getUnitCost } from "@/lib/summary/cost-engine";
import { productCostPerJar, type CostContext } from "@/lib/summary/recipe-cost";
import type { Product, RawMaterialStock } from "@/lib/store/types";

/**
 * What a production run actually needs, checked against every ingredient.
 *
 * A batch isn't blocked by the ingredient that happened to trigger a low-stock warning —
 * it's blocked by whichever one runs out first. Planning from a single-ingredient alert is
 * how you get halfway through a batch and discover there are no lids.
 */
export interface BatchRequirement {
  materialId: string;
  name: string;
  unit: string;
  required: number;
  onHand: number;
  short: number;
  enough: boolean;
}

export interface BatchPlan {
  productId: string;
  productName: string;
  jars: number;
  batches: number;
  requirements: BatchRequirement[];
  /** The most jars the ingredients on hand can actually produce. */
  maxJars: number;
  feasible: boolean;
  costPerJar: number;
  totalCost: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function buildBatchPlan(
  product: Product,
  jars: number,
  rawMaterials: RawMaterialStock[],
  ctx: CostContext,
): BatchPlan {
  // Recipes are written per batch, so a jar count becomes a fractional batch count and
  // ingredient needs scale from there.
  const batches = product.batchYield > 0 ? jars / product.batchYield : 0;

  const requirements: BatchRequirement[] = [];
  let limitingRatio = Infinity;

  for (const row of product.recipeIngredients) {
    const material = rawMaterials.find((m) => m.id === row.materialId);
    if (!material) continue;
    const required = round(row.quantity * batches);
    const onHand = material.qty;
    requirements.push({
      materialId: material.id,
      name: material.name,
      unit: material.unit,
      required,
      onHand,
      short: round(Math.max(0, required - onHand)),
      enough: onHand >= required,
    });
    // How many batches this one ingredient could support on its own.
    if (row.quantity > 0) limitingRatio = Math.min(limitingRatio, onHand / row.quantity);
  }

  const cost = productCostPerJar(product, ctx);
  const maxJars =
    product.batchYield > 0 && Number.isFinite(limitingRatio)
      ? Math.floor(limitingRatio * product.batchYield)
      : 0;

  return {
    productId: product.id,
    productName: product.name,
    jars,
    batches,
    requirements,
    maxJars: requirements.length === 0 ? jars : maxJars,
    feasible: requirements.every((r) => r.enough),
    costPerJar: cost.costPerJar,
    totalCost: cost.costPerJar * jars,
  };
}

/** Current cost of one unit of a material — used by the planner's shortfall pricing. */
export function materialUnitCost(materialId: string, ctx: CostContext): number {
  return getUnitCost(materialId, ctx.rawMaterials, ctx.supplierPrices).cost;
}
