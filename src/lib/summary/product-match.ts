import type { Product } from "@/lib/store/types";

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

/**
 * Entries name products by free text (the AI writes whatever the owner said), while
 * everything downstream keys by product id. Exact name first, then a containment match
 * either way round, so "classic cocoa" and "Classic Cocoa Spread 250ml" both land.
 */
export function resolveProductId(products: Product[], sku: string | null): string | null {
  if (!sku) return null;
  const n = normalize(sku);
  if (!n) return null;
  const match =
    products.find((p) => normalize(p.name) === n) ??
    products.find((p) => normalize(p.name).includes(n) || n.includes(normalize(p.name)));
  return match?.id ?? null;
}
