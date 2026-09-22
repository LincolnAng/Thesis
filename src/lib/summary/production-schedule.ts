import { forecastAll, type ProductForecast } from "@/lib/summary/forecast";
import { rawQuantityNeeded } from "@/lib/summary/cacao";
import type { BusinessEvent, Entry, Machine, Product, RawMaterialStock } from "@/lib/store/types";

/**
 * Turns next month's forecast (plus whatever the owner plans to bring to events) into a
 * day-by-day production calendar.
 *
 * Batches are the unit of work: a machine's day is spent on batches, and recipes are written
 * per batch. Every batch carries a deadline — the end of this month for forecast demand, the
 * day before the event for event stock — and the chosen strategy decides which free day
 * each batch lands on.
 */

export type ScheduleStrategy = "fastest" | "balanced" | "min_expiry";

export const STRATEGY_LABELS: Record<ScheduleStrategy, string> = {
  fastest: "Fastest",
  balanced: "Balanced",
  min_expiry: "Min expiry",
};

export const STRATEGY_HINTS: Record<ScheduleStrategy, string> = {
  fastest: "Everything as early as possible, so the target is done in the fewest days.",
  balanced: "The same amount of work spread evenly across the days available.",
  min_expiry: "Made as close to when it's needed as possible — shortest shelf life last.",
};

export type DayStatus = "past" | "unavailable" | "no_equipment" | "open";

export interface ScheduledRun {
  productId: string;
  productName: string;
  batches: number;
  jars: number;
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  status: DayStatus;
  capacity: number; // batches the equipment can do that day (0 unless open)
  runs: ScheduledRun[];
  eventNames: string[];
}

export interface ProductNeed {
  productId: string;
  productName: string;
  forecastQty: number;
  eventQty: number;
  onHand: number;
  jarsToMake: number;
  batchesNeeded: number;
  batchesScheduled: number;
  batchesLate: number;
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
  days: PlanDay[];
  needs: ProductNeed[];
  ingredientNeeds: IngredientNeed[];
  forecasts: ProductForecast[];
  totalJarsToMake: number;
  totalJarsScheduled: number;
  totalBatchesNeeded: number;
  totalBatchesScheduled: number;
  batchesLate: number;
  batchesUnscheduled: number;
  hasEquipment: boolean;
}

export interface PlanInput {
  products: Product[];
  entries: Entry[];
  machines: Machine[];
  rawMaterials: RawMaterialStock[];
  events: BusinessEvent[];
  eventPlans: Record<string, Record<string, number>>;
  unavailable: Set<string>;
  shelfLifeDays: (productId: string) => number;
  /** Share of raw cacao that's usable, 0–1. */
  cacaoUtilization: number;
  strategy: ScheduleStrategy;
  now?: Date;
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toIsoDate(new Date(y, m - 1, d + n));
}

/** Monday = 0 … Sunday = 6, so "runs 6 days a week" reads as Mon–Sat. */
function mondayFirstDay(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function capacityOn(machines: Machine[], date: Date): number {
  return machines
    .filter((m) => m.batchesPerDay > 0 && mondayFirstDay(date) < Math.max(0, Math.min(7, m.workingDaysPerWeek)))
    .reduce((sum, m) => sum + m.batchesPerDay, 0);
}

interface DemandLine {
  productId: string;
  jars: number;
  deadline: string;
}

interface Job {
  productId: string;
  deadline: string;
  shelfLife: number;
}

export function buildProductionPlan(input: PlanInput): ProductionPlan {
  const now = input.now ?? new Date();
  const today = toIsoDate(now);
  const endOfMonth = toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  // The calendar runs through next month so late batches still have somewhere to land.
  const windowEnd = toIsoDate(new Date(now.getFullYear(), now.getMonth() + 2, 0));

  const forecasts = forecastAll(input.products, input.entries, now);

  // --- Demand: forecast by month end, each upcoming event by the day before it --------------
  const upcomingEvents = input.events.filter(
    (e) => e.status === "open" && (!e.startDate || e.startDate.slice(0, 10) >= today),
  );
  const linesByProduct = new Map<string, DemandLine[]>();
  const push = (line: DemandLine) => {
    if (line.jars <= 0) return;
    const list = linesByProduct.get(line.productId) ?? [];
    list.push(line);
    linesByProduct.set(line.productId, list);
  };
  for (const f of forecasts) push({ productId: f.productId, jars: f.forecastQty, deadline: endOfMonth });
  const eventQtyByProduct = new Map<string, number>();
  for (const event of upcomingEvents) {
    const plan = input.eventPlans[event.id] ?? {};
    const deadline = event.startDate ? addDays(event.startDate.slice(0, 10), -1) : endOfMonth;
    for (const [productId, qty] of Object.entries(plan)) {
      if (!(qty > 0)) continue;
      push({ productId, jars: qty, deadline });
      eventQtyByProduct.set(productId, (eventQtyByProduct.get(productId) ?? 0) + qty);
    }
  }

  // --- Jobs: stock on hand covers the earliest deadlines first, the rest becomes batches ------
  const jobs: Job[] = [];
  const needs: ProductNeed[] = input.products.map((product) => {
    const lines = [...(linesByProduct.get(product.id) ?? [])].sort((a, b) => a.deadline.localeCompare(b.deadline));
    const forecastQty = forecasts.find((f) => f.productId === product.id)?.forecastQty ?? 0;
    const eventQty = eventQtyByProduct.get(product.id) ?? 0;
    const yieldPerBatch = product.batchYield;
    let stock = Math.max(0, product.stockQty);
    let surplus = 0; // jars left over from the last batch, spent on the next line
    let jarsToMake = 0;
    let batches = 0;

    for (const line of lines) {
      let remaining = line.jars;
      const fromStock = Math.min(stock, remaining);
      stock -= fromStock;
      remaining -= fromStock;
      if (remaining <= 0) continue;
      jarsToMake += remaining;
      const fromSurplus = Math.min(surplus, remaining);
      surplus -= fromSurplus;
      remaining -= fromSurplus;
      if (remaining <= 0 || yieldPerBatch <= 0) continue;
      const count = Math.ceil(remaining / yieldPerBatch);
      surplus += count * yieldPerBatch - remaining;
      batches += count;
      for (let i = 0; i < count; i++) {
        jobs.push({ productId: product.id, deadline: line.deadline, shelfLife: input.shelfLifeDays(product.id) });
      }
    }

    return {
      productId: product.id,
      productName: product.name,
      forecastQty,
      eventQty,
      onHand: product.stockQty,
      jarsToMake,
      batchesNeeded: batches,
      batchesScheduled: 0,
      batchesLate: 0,
      missingYield: jarsToMake > 0 && yieldPerBatch <= 0,
    };
  });

  // --- Calendar ---------------------------------------------------------------------------
  const days: PlanDay[] = [];
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let d = new Date(start); toIsoDate(d) <= windowEnd; d.setDate(d.getDate() + 1)) {
    const iso = toIsoDate(d);
    const capacity = capacityOn(input.machines, d);
    const status: DayStatus =
      iso < today ? "past" : input.unavailable.has(iso) ? "unavailable" : capacity <= 0 ? "no_equipment" : "open";
    days.push({
      date: iso,
      status,
      capacity: status === "open" ? capacity : 0,
      runs: [],
      eventNames: upcomingEvents.filter((e) => e.startDate?.slice(0, 10) === iso).map((e) => e.name),
    });
  }
  const openDays = days.filter((d) => d.status === "open");
  const load = new Map<string, number>(openDays.map((d) => [d.date, 0]));
  const placed = new Map<string, string[]>(); // date -> productIds, one per batch

  const free = (day: PlanDay) => day.capacity - (load.get(day.date) ?? 0);
  const place = (day: PlanDay, job: Job) => {
    load.set(day.date, (load.get(day.date) ?? 0) + 1);
    placed.set(day.date, [...(placed.get(day.date) ?? []), job.productId]);
    const need = needs.find((n) => n.productId === job.productId);
    if (need) {
      need.batchesScheduled++;
      if (day.date > job.deadline) need.batchesLate++;
    }
  };

  let unscheduled = 0;
  const earliestFree = () => openDays.find((d) => free(d) > 0);

  if (input.strategy === "min_expiry") {
    // Shortest shelf life claims the latest slots before its deadline; longer-lasting goods
    // fill in earlier. Anything that can't fit before its deadline goes on the first free day after.
    const ordered = [...jobs].sort((a, b) => a.shelfLife - b.shelfLife || b.deadline.localeCompare(a.deadline));
    for (const job of ordered) {
      const beforeDeadline = [...openDays].reverse().find((d) => d.date <= job.deadline && free(d) > 0);
      const day = beforeDeadline ?? openDays.find((d) => d.date > job.deadline && free(d) > 0);
      if (day) place(day, job);
      else unscheduled++;
    }
  } else {
    // Earliest deadline first. Balanced caps each day at an even share of the work, but a
    // deadline always beats evenness: if the capped days run out, the cap is lifted.
    const ordered = [...jobs].sort((a, b) => a.deadline.localeCompare(b.deadline));
    const lastDeadline = ordered.at(-1)?.deadline ?? today;
    const usableDays = openDays.filter((d) => d.date <= lastDeadline).length || openDays.length;
    const cap = input.strategy === "balanced" && usableDays > 0 ? Math.ceil(ordered.length / usableDays) : Infinity;
    for (const job of ordered) {
      const day =
        openDays.find((d) => d.date <= job.deadline && free(d) > 0 && (load.get(d.date) ?? 0) < cap) ??
        earliestFree();
      if (day) place(day, job);
      else unscheduled++;
    }
  }

  const productById = new Map(input.products.map((p) => [p.id, p]));
  for (const day of days) {
    const batchIds = placed.get(day.date);
    if (!batchIds) continue;
    const counts = new Map<string, number>();
    for (const id of batchIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    day.runs = [...counts.entries()].map(([productId, batches]) => {
      const product = productById.get(productId);
      return {
        productId,
        productName: product?.name ?? "Unknown product",
        batches,
        jars: batches * (product?.batchYield ?? 0),
      };
    });
  }

  // --- Ingredients for what's actually scheduled (raw cacao scaled up by utilization) --------
  const required = new Map<string, number>();
  for (const need of needs) {
    if (need.batchesScheduled <= 0) continue;
    for (const row of productById.get(need.productId)?.recipeIngredients ?? []) {
      const material = input.rawMaterials.find((m) => m.id === row.materialId);
      const rawQty = rawQuantityNeeded(material?.name ?? "", row.quantity, input.cacaoUtilization);
      required.set(row.materialId, (required.get(row.materialId) ?? 0) + rawQty * need.batchesScheduled);
    }
  }
  const ingredientNeeds: IngredientNeed[] = [...required.entries()]
    .map(([materialId, qty]) => {
      const material = input.rawMaterials.find((m) => m.id === materialId);
      const onHand = material?.qty ?? 0;
      const rounded = Math.round(qty * 100) / 100;
      return {
        materialId,
        name: material?.name ?? "Unknown ingredient",
        unit: material?.unit ?? "",
        required: rounded,
        onHand,
        short: Math.max(0, Math.round((qty - onHand) * 100) / 100),
      };
    })
    .sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));

  const totalBatchesScheduled = needs.reduce((s, n) => s + n.batchesScheduled, 0);
  return {
    days,
    needs,
    ingredientNeeds,
    forecasts,
    totalJarsToMake: needs.reduce((s, n) => s + n.jarsToMake, 0),
    totalJarsScheduled: days.reduce((s, d) => s + d.runs.reduce((r, run) => r + run.jars, 0), 0),
    totalBatchesNeeded: jobs.length,
    totalBatchesScheduled,
    batchesLate: needs.reduce((s, n) => s + n.batchesLate, 0),
    batchesUnscheduled: unscheduled,
    hasEquipment: input.machines.some((m) => m.batchesPerDay > 0 && m.workingDaysPerWeek > 0),
  };
}
