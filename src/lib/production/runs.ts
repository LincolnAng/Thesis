import { isRawCacao } from "@/lib/summary/cacao";
import { unitsPerBatch } from "@/lib/costing/per-unit";
import { drawOf } from "@/lib/production/batch-draws";
import { findProduct } from "@/lib/summary/product-match";
import type { CacaoMove, Entry, Product, ProductionRun, RawMaterialStock } from "@/lib/store/types";

/**
 * Production runs and the leftover cacao bucket, worked out from what was logged.
 *
 * A run goes raw cacao → roaster → usable cacao → tablea pellets (+ any taken from the bucket)
 * → finished products, and whatever pellets weren't used go into the bucket. The bucket's balance
 * is always what went in minus what came out — never a stored total.
 *
 * Pure: no store, no React.
 */

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Tablea pellets: what usable cacao is ground into before it's packed. Not a material or a
 * product of its own — a stage of every run, and what the leftover bucket holds (by this id).
 */
export const PELLETS = { id: "tablea-pellets", name: "Tablea pellets" } as const;

/** The raw cacao materials — the ones a roast starts from. */
export function cacaoMaterials(materials: RawMaterialStock[]): RawMaterialStock[] {
  return materials.filter((m) => m.kind !== "packaging" && isRawCacao(m.name));
}

/** What a run can start from: any ingredient, raw cacao first. */
export function runMaterials(materials: RawMaterialStock[]): RawMaterialStock[] {
  const ingredients = materials.filter((m) => m.kind !== "packaging");
  return [...ingredients.filter((m) => isRawCacao(m.name)), ...ingredients.filter((m) => !isRawCacao(m.name))];
}

/** Usable cacao one unit of a product takes, by its recipe (recipes are written in usable cacao). */
export function cacaoPerUnit(product: Product, materialId: string): number {
  const batch = product.recipeIngredients.filter((r) => r.materialId === materialId).reduce((t, r) => t + r.quantity, 0);
  return batch / unitsPerBatch(product);
}

/** What's in the bucket for one cacao material. */
export function bucketBalance(moves: CacaoMove[], materialId: string): number {
  return round(moves.filter((m) => m.materialId === materialId).reduce((t, m) => t + (m.direction === "in" ? m.qty : -m.qty), 0));
}

/** Newest first: by date, then by when it was logged. */
export function newestFirst<T extends { date: string; createdAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
}

export interface RunTotals {
  runs: number;
  raw: number;
  usable: number;
  pellets: number;
  fromBucket: number;
  intoProducts: number;
  leftover: number;
  /** Usable out of raw, 0–1, over the runs that roasted anything. Null when nothing was roasted. */
  yield: number | null;
  /** Finished units made in these runs, by product. */
  made: { productId: string; qty: number; unit: string }[];
}

/** Everything the runs added up to. `entries` supplies the batches each run made. */
export function runTotals(runs: ProductionRun[], entries: Entry[], products: Product[]): RunTotals {
  const ids = new Set(runs.map((r) => r.id));
  const raw = round(runs.reduce((t, r) => t + r.rawQty, 0));
  const usableFromRoast = round(runs.filter((r) => r.rawQty > 0).reduce((t, r) => t + r.usableQty, 0));
  const made = new Map<string, { productId: string; qty: number; unit: string }>();
  for (const b of batchesOf(entries, ids)) {
    const product = findProduct(products, b.sku);
    if (!product) continue;
    const row = made.get(product.id) ?? { productId: product.id, qty: 0, unit: b.unit || product.unit || "jars" };
    row.qty = round(row.qty + (b.quantity ?? 0));
    made.set(product.id, row);
  }
  return {
    runs: runs.length,
    raw,
    usable: round(runs.reduce((t, r) => t + r.usableQty, 0)),
    pellets: round(runs.reduce((t, r) => t + r.pelletsQty, 0)),
    fromBucket: round(runs.reduce((t, r) => t + r.fromBucketQty, 0)),
    intoProducts: round(runs.reduce((t, r) => t + r.intoProductsQty, 0)),
    leftover: round(runs.reduce((t, r) => t + r.leftoverQty, 0)),
    yield: raw > 0 ? usableFromRoast / raw : null,
    made: [...made.values()].sort((a, b) => b.qty - a.qty),
  };
}

/** The finished-product batches made in these runs. */
export function batchesOf(entries: Entry[], runIds: Set<string>): Entry[] {
  return entries.filter((e) => e.type === "INVENTORY_IN" && e.runId && runIds.has(e.runId) && (e.quantity ?? 0) > 0);
}

/**
 * Packaging the batches took off the shelf: what was picked when each was logged, or the
 * recipe's when nothing was — the same rule that moves the stock (batch-draws).
 */
export function packagingUsed(batches: Entry[], products: Product[], materials: RawMaterialStock[], cacaoUtilization: number): { material: RawMaterialStock; qty: number }[] {
  const packaging = materials.filter((m) => m.kind === "packaging");
  const totals = new Map<string, number>();
  for (const e of batches) {
    if (e.type !== "INVENTORY_IN") continue;
    const product = findProduct(products, e.sku);
    if (!product) continue;
    for (const m of packaging) {
      const qty = drawOf(e, product, m, cacaoUtilization);
      if (qty > 0) totals.set(m.id, (totals.get(m.id) ?? 0) + qty);
    }
  }
  return packaging
    .filter((m) => totals.has(m.id))
    .map((m) => ({ material: m, qty: round(totals.get(m.id)!) }))
    .sort((a, b) => b.qty - a.qty);
}
