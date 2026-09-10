import type { Product } from "@/lib/store/types";

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

/**
 * Entries name products by free text (the AI writes whatever the owner said), while
 * everything downstream keys by product. Exact name first, then a containment match
 * either way round, so "classic cocoa" and "Classic Cocoa Spread 250ml" both land.
 *
 * This is the only implementation. It previously existed four times over — in the store,
 * in sales-summary, in describe-entry and here — so a sale could resolve to one product
 * when deducting stock and another when reporting on it.
 */
export function findProduct(products: Product[], sku: string | null): Product | undefined {
  if (!sku) return undefined;
  const n = normalize(sku);
  if (!n) return undefined;
  return (
    products.find((p) => normalize(p.name) === n) ??
    products.find((p) => normalize(p.name).includes(n) || n.includes(normalize(p.name)))
  );
}

export function resolveProductId(products: Product[], sku: string | null): string | null {
  return findProduct(products, sku)?.id ?? null;
}
