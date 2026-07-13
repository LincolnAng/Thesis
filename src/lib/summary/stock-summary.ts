import type { Entry, Product, RawMaterialStock } from "@/lib/store/types";
import { sum } from "./period";

export interface ProductStockRow {
  product: Product;
  barPct: number;
  tone: "good" | "warning";
  runwayDays: number | null;
}

export interface IngredientRow {
  material: RawMaterialStock;
  batches: number | null;
  tone: "good" | "warning";
  text: string;
}

export interface StockSummary {
  products: ProductStockRow[];
  mostUrgent: ProductStockRow | null;
  ingredients: IngredientRow[];
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

function salesVelocityPerDay(entries: Entry[], productName: string, days = 30): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const n = normalize(productName);
  const sales = entries.filter(
    (e) => e.type === "SALE" && e.sku && normalize(e.sku) === n && new Date(e.timestamp).getTime() >= cutoff,
  );
  return sum(sales, (e) => e.quantity ?? 0) / days;
}

export function computeStockSummary(
  products: Product[],
  rawMaterials: RawMaterialStock[],
  entries: Entry[],
): StockSummary {
  const productRows: ProductStockRow[] = products.map((p) => {
    const healthyLevel = p.lowStockThreshold * 3;
    const barPct = healthyLevel > 0 ? Math.min(100, (p.stockQty / healthyLevel) * 100) : 0;
    const tone: "good" | "warning" = p.stockQty <= p.lowStockThreshold ? "warning" : "good";
    const velocity = salesVelocityPerDay(entries, p.name);
    const runwayDays = velocity > 0 ? Math.round(p.stockQty / velocity) : null;
    return { product: p, barPct, tone, runwayDays };
  });

  const mostUrgent =
    productRows
      .filter((r) => r.tone === "warning")
      .sort((a, b) => (a.runwayDays ?? Infinity) - (b.runwayDays ?? Infinity))[0] ?? null;

  const ingredients: IngredientRow[] = rawMaterials.map((m) => {
    const batches = m.perBatchQty ? m.qty / m.perBatchQty : null;
    const low = batches !== null ? batches < 1 : m.qty <= m.lowStockThreshold;
    let text: string;
    if (batches !== null) {
      const wholeBatches = Math.floor(batches);
      text =
        wholeBatches >= 1
          ? `${m.qty} ${m.unit} — enough for ${wholeBatches} batch${wholeBatches === 1 ? "" : "es"}`
          : `${m.qty} ${m.unit} — not enough for a full batch`;
    } else {
      text = `${m.qty} ${m.unit}`;
    }
    return { material: m, batches, tone: low ? "warning" : "good", text };
  });

  return { products: productRows, mostUrgent, ingredients };
}
