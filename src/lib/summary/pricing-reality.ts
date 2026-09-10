import { effectiveProductPrice, productCostPerJar, type CostContext } from "@/lib/summary/recipe-cost";
import { findProduct } from "@/lib/summary/product-match";
import type { Entry, Product } from "@/lib/store/types";

/**
 * What the calculator says a product should cost, next to what it actually sells for.
 *
 * The calculator was working out P58.50 while the same jars went out the door at P120 and
 * P180. A pricing tool that ignores the prices the business actually charges is advising
 * someone else's business.
 */
export interface PricingRow {
  productId: string;
  productName: string;
  costPerJar: number;
  calculatedPrice: number;
  /** Mean price actually charged over the window, or null when nothing sold. */
  actualPrice: number | null;
  actualSales: number;
  actualJars: number;
  /** actualPrice − calculatedPrice; positive means selling above the formula. */
  gap: number | null;
  marginPct: number;
  profitPerJar: number;
}

const WINDOW_DAYS = 30;

export function buildPricingRows(
  products: Product[],
  entries: Entry[],
  ctx: CostContext,
  now = new Date(),
): PricingRow[] {
  const cutoff = now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recentSales = entries.filter(
    (e) => e.type === "SALE" && new Date(e.timestamp).getTime() >= cutoff,
  );

  return products
    .map((product) => {
      const cost = productCostPerJar(product, ctx);
      const calculated = effectiveProductPrice(product, cost);

      const mine = recentSales.filter((e) => findProduct(products, e.sku)?.id === product.id);
      const jars = mine.reduce((sum, e) => sum + (e.quantity ?? 0), 0);
      const revenue = mine.reduce((sum, e) => sum + (e.amount ?? 0), 0);
      const actualPrice = jars > 0 ? revenue / jars : null;

      // Margin is measured against what's actually charged where that's known — the
      // formula price is a proposal, not a fact about the business.
      const referencePrice = actualPrice ?? calculated;
      return {
        productId: product.id,
        productName: product.name,
        costPerJar: cost.costPerJar,
        calculatedPrice: calculated,
        actualPrice,
        actualSales: mine.length,
        actualJars: jars,
        gap: actualPrice == null ? null : actualPrice - calculated,
        marginPct: referencePrice > 0 ? ((referencePrice - cost.costPerJar) / referencePrice) * 100 : 0,
        profitPerJar: referencePrice - cost.costPerJar,
      };
    })
    .sort((a, b) => b.profitPerJar - a.profitPerJar);
}

export const PRICING_WINDOW_DAYS = WINDOW_DAYS;
