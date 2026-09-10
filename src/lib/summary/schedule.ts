import { forecastAll, nextMonthLabel, type ProductForecast } from "@/lib/summary/forecast";
import type { Entry, Machine, Product, RawMaterialStock } from "@/lib/store/types";

/**
 * Turns next month's forecast demand into a day-by-day production plan for the days left in
 * this month, within what the machines can actually finish.
 *
 * Batches, not jars, are the unit of scheduling: a machine's day is consumed by a batch
 * regardless of whether that batch yields 20 jars or 40, and recipes are already written per
 * batch. Products are scheduled most-urgent-first — the one whose stock covers the least of
 * its own forecast goes first — so when capacity runs short, what gets dropped is whatever
 * was already best covered.
 */

export interface ScheduledRun {
  date: string; // ISO date, YYYY-MM-DD
  machineId: string;
  machineName: string;
  productId: string;
  productName: string;
  batches: number;
  jars: number;
}

export interface ScheduleDay {
  date: string;
  weekdayLabel: string;
  runs: ScheduledRun[];
  batches: number;
}

export interface ProductRequirement {
  productId: string;
  productName: string;
  forecastQty: number;
  currentStock: number;
  neededJars: number;
  batchesNeeded: number;
  batchesScheduled: number;
  /** True when the recipe has no yield set, so jars-per-batch is unknown. */
  missingYield: boolean;
}

export interface IngredientNeed {
  materialId: string;
  name: string;
  unit: string;
  required: number;
  onHand: number;
  short: number;
}

export interface ProductionPlan {
  targetMonthLabel: string;
  windowStart: string | null;
  windowEnd: string | null;
  workingDayCount: number;
  days: ScheduleDay[];
  requirements: ProductRequirement[];
  totalBatchesNeeded: number;
  totalBatchesScheduled: number;
  capacityBatches: number;
  shortfallBatches: number;
  feasible: boolean;
  ingredientNeeds: IngredientNeed[];
  forecasts: ProductForecast[];
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday = 0 … Sunday = 6, so "runs 6 days a week" reads as Mon-Sat rather than Sun-Fri. */
function mondayFirstDay(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function machineRunsOn(machine: Machine, date: Date): boolean {
  return mondayFirstDay(date) < Math.max(0, Math.min(7, machine.workingDaysPerWeek));
}

/** Today through the end of this month — production already past can't be rescheduled. */
function remainingDaysThisMonth(now: Date): Date[] {
  const days: Date[] = [];
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  for (let day = now.getDate(); day <= end.getDate(); day++) {
    days.push(new Date(now.getFullYear(), now.getMonth(), day));
  }
  return days;
}

export function buildProductionPlan(
  products: Product[],
  entries: Entry[],
  machines: Machine[],
  rawMaterials: RawMaterialStock[],
  now = new Date(),
): ProductionPlan {
  const forecasts = forecastAll(products, entries, now);
  const window = remainingDaysThisMonth(now);

  const requirements: ProductRequirement[] = forecasts.map((f) => {
    const product = products.find((p) => p.id === f.productId);
    const yieldPerBatch = product?.batchYield ?? 0;
    const neededJars = f.suggestedProduction;
    return {
      productId: f.productId,
      productName: f.productName,
      forecastQty: f.forecastQty,
      currentStock: f.currentStock,
      neededJars,
      batchesNeeded: yieldPerBatch > 0 ? Math.ceil(neededJars / yieldPerBatch) : 0,
      batchesScheduled: 0,
      missingYield: neededJars > 0 && yieldPerBatch <= 0,
    };
  });

  // Most urgent first — forecastAll already orders by how little of its own forecast each
  // product's stock covers, so the queue inherits that priority.
  const queue = requirements.filter((r) => r.batchesNeeded > 0).map((r) => ({ req: r, remaining: r.batchesNeeded }));

  const days: ScheduleDay[] = [];
  let capacityBatches = 0;
  let workingDayCount = 0;

  for (const date of window) {
    const activeMachines = machines.filter((m) => machineRunsOn(m, date) && m.batchesPerDay > 0);
    if (activeMachines.length === 0) continue;
    workingDayCount++;

    const runs: ScheduledRun[] = [];
    for (const machine of activeMachines) {
      capacityBatches += machine.batchesPerDay;
      let free = machine.batchesPerDay;
      while (free > 0) {
        const next = queue.find((q) => q.remaining > 0);
        if (!next) break;
        const take = Math.min(free, next.remaining);
        const product = products.find((p) => p.id === next.req.productId);
        runs.push({
          date: toIsoDate(date),
          machineId: machine.id,
          machineName: machine.name,
          productId: next.req.productId,
          productName: next.req.productName,
          batches: take,
          jars: take * (product?.batchYield ?? 0),
        });
        next.remaining -= take;
        next.req.batchesScheduled += take;
        free -= take;
      }
    }

    if (runs.length > 0) {
      days.push({
        date: toIsoDate(date),
        weekdayLabel: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        runs,
        batches: runs.reduce((sum, r) => sum + r.batches, 0),
      });
    }
  }

  const totalBatchesNeeded = requirements.reduce((sum, r) => sum + r.batchesNeeded, 0);
  const totalBatchesScheduled = requirements.reduce((sum, r) => sum + r.batchesScheduled, 0);

  // Ingredients are costed against what actually got scheduled, not against what was wanted —
  // a plan that can't fit the batches doesn't consume the ingredients for them either.
  const needByMaterial = new Map<string, number>();
  for (const req of requirements) {
    if (req.batchesScheduled <= 0) continue;
    const product = products.find((p) => p.id === req.productId);
    for (const row of product?.recipeIngredients ?? []) {
      needByMaterial.set(row.materialId, (needByMaterial.get(row.materialId) ?? 0) + row.quantity * req.batchesScheduled);
    }
  }

  const ingredientNeeds: IngredientNeed[] = [...needByMaterial.entries()]
    .map(([materialId, required]) => {
      const material = rawMaterials.find((m) => m.id === materialId);
      const onHand = material?.qty ?? 0;
      return {
        materialId,
        name: material?.name ?? "Unknown ingredient",
        unit: material?.unit ?? "",
        required: Math.round(required * 100) / 100,
        onHand,
        short: Math.max(0, Math.round((required - onHand) * 100) / 100),
      };
    })
    .sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));

  return {
    targetMonthLabel: nextMonthLabel(now),
    windowStart: window.length > 0 ? toIsoDate(window[0]) : null,
    windowEnd: window.length > 0 ? toIsoDate(window[window.length - 1]) : null,
    workingDayCount,
    days,
    requirements,
    totalBatchesNeeded,
    totalBatchesScheduled,
    capacityBatches,
    shortfallBatches: Math.max(0, totalBatchesNeeded - totalBatchesScheduled),
    feasible: totalBatchesScheduled >= totalBatchesNeeded,
    ingredientNeeds,
    forecasts,
  };
}
