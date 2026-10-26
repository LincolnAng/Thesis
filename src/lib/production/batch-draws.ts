import { rawQuantityNeeded } from "@/lib/summary/cacao";
import { unitsPerBatch } from "@/lib/costing/per-unit";
import type { Entry, Product, RawMaterialStock } from "@/lib/store/types";

/**
 * What logging a batch takes off each material's shelf — the one rule, used both when a batch
 * is saved (store) and when stock is worked out from the ledger (ingredient-cost), so the two
 * can't drift apart.
 *
 *   - The recipe is stored a batch at a time; a product with no batch size counts its recipe
 *     as one unit (lib/costing/per-unit).
 *   - Packaging picked in the Add form replaces the recipe's packaging for that batch.
 *   - Tingi repacked into jars is product that was already made: it draws no ingredients, only
 *     the packaging it went into.
 *
 * Pure: no store, no React.
 */

type Batch = Pick<Entry, "quantity" | "packagingUsed" | "fromTingi">;

export function drawOf(entry: Batch, product: Product, material: Pick<RawMaterialStock, "id" | "name" | "kind">, cacaoUtilization: number): number {
  const qty = entry.quantity ?? 0;
  if (qty <= 0) return 0;
  const picked = Array.isArray(entry.packagingUsed) ? entry.packagingUsed : null;
  if (picked && material.kind === "packaging") {
    return picked.filter((p) => p.materialId === material.id).reduce((t, p) => t + Math.max(0, p.qty), 0);
  }
  if (entry.fromTingi) return 0;
  const row = product.recipeIngredients.find((r) => r.materialId === material.id);
  if (!row) return 0;
  return rawQuantityNeeded(material.name, row.quantity, cacaoUtilization) * (qty / unitsPerBatch(product));
}

/** In-house components (tablea in ice cream) a batch takes off their own shelf. */
export function componentDraws(entry: Batch, product: Product): { productId: string; qty: number }[] {
  const qty = entry.quantity ?? 0;
  if (qty <= 0 || entry.fromTingi) return [];
  return (product.recipeComponents ?? [])
    .filter((c) => c.productId !== product.id)
    .map((c) => ({ productId: c.productId, qty: c.quantity * (qty / unitsPerBatch(product)) }));
}
