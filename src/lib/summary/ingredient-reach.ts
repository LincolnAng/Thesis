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
  /** True when the projection is suppressed for want of history. */
  insufficientHistory: boolean;
  /** True when daysLeft hit the display ceiling and should read as "90+". */
  capped: boolean;
  /** Set when the material has a reorder point and is at or below it. */
  belowReorderPoint: boolean;
}

const WINDOW_DAYS = 30;

/**
 * A month of records and a handful of sales before any run-out date is shown.
 *
 * One month of sales was producing figures like "1,869 days left" and colouring them green
 * — arithmetic dividing a full shelf by an almost-zero rate. Fake precision labelled as
 * confidence is worse than no estimate, because it invites the owner to stop checking.
 */
const MIN_HISTORY_DAYS = 30;
const MIN_SALES = 5;

/** Nothing beyond this is a real forecast; past it the number only tracks how little sold. */
const MAX_DISPLAY_DAYS = 90;

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

  // How much history actually exists, as opposed to how much window we asked for.
  const dated = entries.map((e) => new Date(e.timestamp).getTime()).filter((t) => Number.isFinite(t));
  const historyDays = dated.length > 0 ? (now.getTime() - Math.min(...dated)) / (24 * 60 * 60 * 1000) : 0;
  const saleCount = entries.filter((e) => e.type === "SALE").length;
  const insufficientHistory = historyDays < MIN_HISTORY_DAYS || saleCount < MIN_SALES;

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
    const reorderPoint = material.reorderPoint ?? null;
    const belowReorderPoint = reorderPoint != null && reorderPoint > 0 && material.qty <= reorderPoint;

    if (avgDailyUse <= 0 || insufficientHistory) {
      return {
        material,
        avgDailyUse,
        isEstimate,
        daysLeft: null,
        runOutDate: null,
        // With no projection, the reorder point is the only real signal there is.
        urgency: belowReorderPoint ? "red" : null,
        color,
        insufficientHistory,
        capped: false,
        belowReorderPoint,
      };
    }

    const rawDaysLeft = Math.max(0, Math.round(material.qty / avgDailyUse));
    const capped = rawDaysLeft > MAX_DISPLAY_DAYS;
    const daysLeft = capped ? MAX_DISPLAY_DAYS : rawDaysLeft;
    const runOutDate = capped ? null : new Date(today.getTime() + daysLeft * 24 * 60 * 60 * 1000);
    const urgency = belowReorderPoint ? "red" : urgencyOf(daysLeft);

    return {
      material,
      avgDailyUse,
      isEstimate,
      daysLeft,
      runOutDate,
      urgency,
      color,
      insufficientHistory: false,
      capped,
      belowReorderPoint,
    };
  });
}
