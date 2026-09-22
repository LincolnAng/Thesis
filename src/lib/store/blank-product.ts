import type { Product } from "./types";

/** A new product with nothing configured yet — pricing and recipe get filled in later on
 * the Pricing page. */
export function blankProduct(name: string, overrides: Partial<Omit<Product, "id">> = {}): Omit<Product, "id"> {
  return {
    name: name.trim(),
    standardPrice: 0,
    pricingMode: "manual",
    marginPercent: 0,
    marketPrice: 0,
    friendPrice: 0,
    wholesalePrice: 0,
    stockQty: 0,
    lowStockThreshold: 0,
    batchYield: 0,
    recipeIngredients: [],
    recipeLabor: [],
    recipeMisc: [],
    ...overrides,
  };
}
