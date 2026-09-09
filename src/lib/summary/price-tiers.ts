import type { PriceTier, Product } from "@/lib/store/types";

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

/** Every tier that could apply to a sale of this product/variant — scoped to the product,
 * and either variant-specific or product-wide (variantId === null applies regardless of size). */
export function tiersForProduct(product: Product, tiers: PriceTier[], variantId: string | null): PriceTier[] {
  return tiers.filter((t) => t.productId === product.id && (t.variantId === null || t.variantId === variantId));
}

/** Picks the single best-matching tier for a sale, in priority order: an exact customer
 * match, then the highest quantity-break threshold the quantity clears, then a region match.
 * Returns null when nothing applies — callers fall back to the product's normal price, same
 * as before PriceTiers existed. */
export function resolvePriceTier(
  product: Product,
  tiers: PriceTier[],
  context: { quantity: number | null; location: string | null; customerId: string | null; variantId: string | null },
): PriceTier | null {
  const candidates = tiersForProduct(product, tiers, context.variantId);

  if (context.customerId) {
    const customerTier = candidates.find((t) => t.dimensionType === "customer" && t.dimensionValue === context.customerId);
    if (customerTier) return customerTier;
  }

  if (context.quantity) {
    const qualifying = candidates
      .filter((t) => t.dimensionType === "quantity_break" && Number(t.dimensionValue) <= context.quantity!)
      .sort((a, b) => Number(b.dimensionValue) - Number(a.dimensionValue));
    if (qualifying.length > 0) return qualifying[0];
  }

  if (context.location) {
    const n = normalize(context.location);
    const regionTier = candidates.find((t) => t.dimensionType === "region" && normalize(t.dimensionValue) === n);
    if (regionTier) return regionTier;
  }

  return null;
}
