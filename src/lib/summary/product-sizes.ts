/**
 * Products grouped into families by size.
 *
 * A 100g jar and a 250g jar are not one product with a number attached. They have different
 * recipes, different costs, different prices and separate stock — everything that makes a
 * product a product. Modelling a size as something less than a product would have meant
 * teaching costing, forecasting and expiry about a second kind of thing that behaves exactly
 * like the first.
 *
 * So a size IS a product, and this only records which ones belong together. The family head
 * is the product nothing points at; its sizes are the products pointing back.
 *
 * Pure: no store, no React.
 */

import type { Product } from "@/lib/store/types";

export interface ProductFamily {
  /** The product the others are sizes of. */
  head: Product;
  /** Its sizes, biggest-selling first. Empty for a product with no sizes. */
  sizes: Product[];
  /** head plus sizes, which is what stock and forecasting still work over. */
  all: Product[];
}

export function familiesOf(products: Product[]): ProductFamily[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const heads = products.filter((p) => !p.sizeOfId || !byId.has(p.sizeOfId));

  return heads.map((head) => {
    const sizes = products
      .filter((p) => p.sizeOfId === head.id)
      .sort((a, b) => (a.sizeLabel ?? "").localeCompare(b.sizeLabel ?? "", undefined, { numeric: true }));
    return { head, sizes, all: [head, ...sizes] };
  });
}

/** What to call this product on a screen that already shows the family name. */
export function sizeName(product: Product): string {
  return product.sizeLabel?.trim() || "Standard";
}

/**
 * A size label as a reader takes it in. A bare number ("5") says nothing on its own, so it is
 * shown as "Size 5"; anything with words or a unit in it ("250g", "gift box") stays as typed.
 */
export function sizeTag(label: string | null | undefined): string | null {
  const t = label?.trim();
  if (!t) return null;
  return /^\d+(\.\d+)?$/.test(t) ? `Size ${t}` : t;
}

/** What to call it on a screen that does not. */
export function fullName(product: Product, products: Product[]): string {
  if (!product.sizeOfId) return product.sizeLabel ? `${product.name} · ${product.sizeLabel}` : product.name;
  const head = products.find((p) => p.id === product.sizeOfId);
  const family = head?.name ?? product.name;
  return product.sizeLabel ? `${family} · ${product.sizeLabel}` : family;
}

/**
 * A new size, started from its family head.
 *
 * Copies the recipe rather than sharing it: the next thing she does is change the quantities,
 * because that is what a different size IS. Sharing would mean editing one size silently
 * reprices the others.
 */
export function newSizeFrom(head: Product, label: string): Omit<Product, "id"> {
  return {
    ...head,
    name: head.name,
    sizeLabel: label.trim(),
    sizeOfId: head.id,
    // Its own shelf, from zero. Inheriting the head's stock would invent jars.
    stockQty: 0,
    recipeIngredients: head.recipeIngredients.map((r) => ({ ...r })),
    recipeLabor: head.recipeLabor.map((r) => ({ ...r })),
    recipeMisc: head.recipeMisc.map((r) => ({ ...r })),
  };
}
