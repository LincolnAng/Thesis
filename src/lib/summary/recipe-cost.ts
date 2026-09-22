import { priceFromMargin, priceFromMarkup } from "./pricing-methods";
import { batchLaborCost, getProductCost, getUnitCost, type CostLine } from "./cost-engine";
import { rawQuantityNeeded } from "./cacao";
import type { Product, RawMaterialStock, RecipeExtraRow, RecipeIngredientRow, SupplierPrice } from "@/lib/store/types";

/**
 * The costing surface every page reads. It is a thin shell over cost-engine — the actual
 * chain lives there — kept so callers have one import and one shape to work with.
 */

/** Everything the cost chain needs. Passed around as one object so a page can't accidentally
 * cost a product against supplier prices while another costs it without them. */
export interface CostContext {
  rawMaterials: RawMaterialStock[];
  supplierPrices: SupplierPrice[];
  hourlyLaborRate: number;
  /** Share of raw cacao that's usable after processing, 0–1 (1 = no loss). */
  cacaoUtilization: number;
}

export interface ProductCostBreakdown {
  // Per batch
  ingredientTotal: number;
  packagingTotal: number;
  laborTotal: number;
  miscTotal: number;
  batchTotal: number;
  // Per jar — these four sum to costPerJar
  ingredientPerJar: number;
  packagingPerJar: number;
  laborPerJar: number;
  miscPerJar: number;
  costPerJar: number;
  /** True when labor came from a figure the owner typed rather than from minutes × rate. */
  laborIsOverride: boolean;
  ingredientLines: CostLine[];
  packagingLines: CostLine[];
  unconvertible: string[];
}

function sumExtras(rows: RecipeExtraRow[]): number {
  return rows.reduce((total, row) => total + row.cost, 0);
}

/** Cost of a single recipe row at the material's current unit cost. */
export function ingredientRowCost(row: RecipeIngredientRow, ctx: CostContext): number {
  const material = ctx.rawMaterials.find((m) => m.id === row.materialId);
  const rawQty = material ? rawQuantityNeeded(material.name, row.quantity, ctx.cacaoUtilization) : row.quantity;
  return getUnitCost(row.materialId, ctx.rawMaterials, ctx.supplierPrices).cost * rawQty;
}

export function ingredientBatchTotal(rows: RecipeIngredientRow[], ctx: CostContext): number {
  return rows.reduce((total, row) => total + ingredientRowCost(row, ctx), 0);
}

/** The price actually charged at the standard tier, derived from the product's chosen
 * pricing method — cost-, margin-, and market-based all compute this live rather than trusting
 * a possibly-stale `standardPrice`, which is only the source of truth in "manual" mode. */
export function effectiveProductPrice(product: Product, cost: ProductCostBreakdown): number {
  if (product.pricingMode === "cost_percent") return priceFromMarkup(cost.costPerJar, product.marginPercent);
  if (product.pricingMode === "margin") return priceFromMargin(cost.costPerJar, product.marginPercent);
  if (product.pricingMode === "competitive") return product.marketPrice;
  return product.standardPrice;
}

/**
 * Cost per jar, always computed live from current supplier prices and the recipe — never
 * cached on the product — so it can't go stale when an ingredient's price changes.
 */
export function productCostPerJar(product: Product, ctx: CostContext): ProductCostBreakdown {
  const cost = getProductCost(product, ctx.rawMaterials, ctx.supplierPrices, ctx.hourlyLaborRate, ctx.cacaoUtilization);
  const ingredientTotal = cost.ingredientLines.reduce((sum, l) => sum + l.batchCost, 0);
  const packagingTotal = cost.packagingLines.reduce((sum, l) => sum + l.batchCost, 0);
  const laborTotal = batchLaborCost(product, ctx.hourlyLaborRate).cost;
  const miscTotal = sumExtras(product.recipeMisc);

  return {
    ingredientTotal,
    packagingTotal,
    laborTotal,
    miscTotal,
    batchTotal: ingredientTotal + packagingTotal + laborTotal + miscTotal,
    ingredientPerJar: cost.ingredientCost,
    packagingPerJar: cost.packagingCost,
    laborPerJar: cost.laborCost,
    miscPerJar: cost.otherCost,
    costPerJar: cost.totalCost,
    laborIsOverride: cost.laborIsOverride,
    ingredientLines: cost.ingredientLines,
    packagingLines: cost.packagingLines,
    unconvertible: cost.unconvertible,
  };
}
