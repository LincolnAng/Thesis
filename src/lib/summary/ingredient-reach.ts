import type { Entry, Product, RawMaterialStock } from "@/lib/store/types";
import { chipColor } from "@/lib/chart-colors";
import { sum } from "./period";

export type Urgency = "red" | "amber" | "green";

export interface IngredientReach {
  material: RawMaterialStock;
  avgDailyUse: number;
  isEstimate: boolean;
  daysLeft: number | null; // null when there's no usage history to project from
  runOutDate: Date | null;
  urgency: Urgency | null;
  color: string;
}

const WINDOW_DAYS = 30;

function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function urgencyOf(daysLeft: number): Urgency {
  if (daysLeft < 7) return "red";
  if (daysLeft <= 14) return "amber";
  return "green";
}

function averageBatchYield(products: Product[]): number {
  if (products.length === 0) return 1;
  return sum(products, (p) => p.batchYield) / products.length;
}

/**
 * Estimates how many days each raw ingredient has left, projected from real
 * production history (INVENTORY_IN entries). Production entries are thin for
 * most home producers, so this falls back to inferring usage from recent
 * sales velocity (a sale implies a batch was made to supply it) rather than
 * guessing a number out of thin air.
 */
export function computeIngredientReach(
  rawMaterials: RawMaterialStock[],
  products: Product[],
  entries: Entry[],
  now: Date = new Date(),
): IngredientReach[] {
  const cutoff = now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const avgYield = averageBatchYield(products);

  const jarsProduced = sum(
    entries.filter((e) => e.type === "INVENTORY_IN" && new Date(e.timestamp).getTime() >= cutoff),
    (e) => e.quantity ?? 0,
  );
  const jarsSold = sum(
    entries.filter((e) => e.type === "SALE" && new Date(e.timestamp).getTime() >= cutoff),
    (e) => e.quantity ?? 0,
  );

  const batchesFromProduction = jarsProduced / avgYield;
  const batchesFromSales = jarsSold / avgYield;
  const isEstimate = batchesFromProduction <= 0;
  const batchesPerDay = (isEstimate ? batchesFromSales : batchesFromProduction) / WINDOW_DAYS;

  const today = midnight(now);

  // Color identifies WHICH ingredient a line belongs to — not how urgent it is.
  // Urgency already has its own channel (the legend word and the red-zone alert
  // cards below the calendar), so reusing color for both meant every "safe"
  // ingredient rendered as the same indistinguishable green block.
  return rawMaterials.map((material, index) => {
    const color = material.color ?? chipColor(index);
    const avgDailyUse = material.perBatchQty ? material.perBatchQty * batchesPerDay : 0;

    if (avgDailyUse <= 0) {
      return {
        material,
        avgDailyUse: 0,
        isEstimate,
        daysLeft: null,
        runOutDate: null,
        urgency: null,
        color,
      };
    }

    const daysLeft = Math.max(0, Math.round(material.qty / avgDailyUse));
    const runOutDate = new Date(today.getTime() + daysLeft * 24 * 60 * 60 * 1000);
    const urgency = urgencyOf(daysLeft);

    return { material, avgDailyUse, isEstimate, daysLeft, runOutDate, urgency, color };
  });
}
