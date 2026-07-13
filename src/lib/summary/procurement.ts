import type { Entry } from "@/lib/store/types";

export interface ProcurementRecord {
  date: string;
  qty: number;
  unit: string;
  unitCost: number;
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

/** Every logged purchase (EXPENSE entry) that matches an ingredient's name, oldest to newest. */
export function procurementHistoryFor(entries: Entry[], ingredientName: string): ProcurementRecord[] {
  const n = normalize(ingredientName);
  if (!n) return [];
  return entries
    .filter((e) => e.type === "EXPENSE" && e.sku && e.amount && e.quantity && normalize(e.sku).includes(n))
    .map((e) => ({ date: e.timestamp, qty: e.quantity!, unit: e.unit ?? "pcs", unitCost: e.amount! / e.quantity! }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Weighted-average unit cost across every logged purchase (the "peanut butter"
 * costing method — every peso spent gets spread evenly across all units on
 * hand, instead of only using the most recent purchase price). This keeps a
 * single price spike or dip from skewing the ingredient's cost estimate.
 */
export function weightedAverageUnitCost(records: ProcurementRecord[]): number | null {
  const totalQty = records.reduce((sum, r) => sum + r.qty, 0);
  if (totalQty <= 0) return null;
  const totalCost = records.reduce((sum, r) => sum + r.qty * r.unitCost, 0);
  return totalCost / totalQty;
}
