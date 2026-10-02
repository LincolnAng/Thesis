import { forecastAll, type ProductForecast } from "@/lib/summary/forecast";
import { rawQuantityNeeded } from "@/lib/summary/cacao";
import type { BusinessEvent, Entry, Machine, Product, RawMaterialStock } from "@/lib/store/types";

/**
 * Turns next month's demand (plus whatever is planned for events) into a day-by-day
 * production calendar.
 *
 * Everything is counted in products and minutes. A jar takes a known number of minutes to
 * make, cacao through to sealed jar; a machine's day is a number of hours. Capacity is
 * therefore time, and a day holds as many jars as their minutes fit into.
 *
 * It used to be counted in batches, which measured different things for different products —
 * a "batch" was 40 jars of one spread and 35 of another, so "2 batches a day" of equipment
 * meant no fixed amount of work, and a product needing 7 jars consumed a whole batch of
 * capacity. Minutes are the same unit whatever is being made.
 *
 * Every jar carries a deadline — the end of this month for forecast demand, the day before
 * the event for event stock — and the chosen strategy decides which free day it lands on.
 * A product's jars can split across days when one day's time runs out.
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
  jars: number;
  /** Equipment time those jars take up on the day. */
  minutes: number;
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  status: DayStatus;
  /** Minutes of equipment time available that day (0 unless open). */
  capacity: number;
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
  jarsScheduled: number;
  jarsLate: number;
  /** Jars landing so far before their deadline that they'd be past their shelf life by the
   * time they're needed. Fastest and Balanced both chase the deadline, not freshness, so
   * without this nothing ever says the jars would be spoiled on arrival. */
  jarsExpiring: number;
  minutesPerUnit: number;
  minutesNeeded: number;
  /** No "minutes a jar takes" recorded, so its time can't be fitted into a day. */
  missingMinutes: boolean;
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
  totalMinutesNeeded: number;
  jarsLate: number;
  jarsExpiring: number;
  jarsUnscheduled: number;
  hasEquipment: boolean;
  /** Products that need making but have no minutes recorded — nothing can be timetabled
   * for them until that's filled in. */
  productsMissingMinutes: string[];
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

/** Whole days from `a` to `b`, negative when `b` is earlier. */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toIsoDate(new Date(y, m - 1, d + n));
}

/** Monday = 0 … Sunday = 6, so "runs 6 days a week" reads as Mon–Sat. */
function mondayFirstDay(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Minutes of equipment time on a date — the hours every machine running that weekday adds up to. */
function capacityMinutesOn(machines: Machine[], date: Date): number {
  return machines
    .filter((m) => m.hoursPerDay > 0 && mondayFirstDay(date) < Math.max(0, Math.min(7, m.workingDaysPerWeek)))
    .reduce((sum, m) => sum + m.hoursPerDay * 60, 0);
}

/** How long one jar of this product takes, cacao through to sealed jar. */
export function minutesPerUnitOf(product: Product): number {
  return Math.max(0, product.minutesPerUnit ?? 0);
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
  minutesPerUnit: number;
  jars: number;
}

export function buildProductionPlan(input: PlanInput): ProductionPlan {
  const now = input.now ?? new Date();
  const today = toIsoDate(now);
  const endOfMonth = toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  // The calendar runs through next month so late jars still have somewhere to land.
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

  // --- Jobs: stock on hand covers the earliest deadlines first, the rest has to be made ------
  const jobs: Job[] = [];
  const needs: ProductNeed[] = input.products.map((product) => {
    const lines = [...(linesByProduct.get(product.id) ?? [])].sort((a, b) => a.deadline.localeCompare(b.deadline));
    const forecastQty = forecasts.find((f) => f.productId === product.id)?.forecastQty ?? 0;
    const eventQty = eventQtyByProduct.get(product.id) ?? 0;
    const minutesPerUnit = minutesPerUnitOf(product);
    let stock = Math.max(0, product.stockQty);
    let jarsToMake = 0;

    for (const line of lines) {
      const fromStock = Math.min(stock, line.jars);
      stock -= fromStock;
      const remaining = line.jars - fromStock;
      if (remaining <= 0) continue;
      jarsToMake += remaining;
      jobs.push({
        productId: product.id,
        deadline: line.deadline,
        shelfLife: input.shelfLifeDays(product.id),
        minutesPerUnit,
        jars: remaining,
      });
    }

    return {
      productId: product.id,
      productName: product.name,
      forecastQty,
      eventQty,
      onHand: product.stockQty,
      jarsToMake,
      jarsScheduled: 0,
      jarsLate: 0,
      jarsExpiring: 0,
      minutesPerUnit,
      minutesNeeded: jarsToMake * minutesPerUnit,
      missingMinutes: jarsToMake > 0 && minutesPerUnit <= 0,
    };
  });

  // --- Calendar ---------------------------------------------------------------------------
  const days: PlanDay[] = [];
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let d = new Date(start); toIsoDate(d) <= windowEnd; d.setDate(d.getDate() + 1)) {
    const iso = toIsoDate(d);
    const capacity = capacityMinutesOn(input.machines, d);
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
  const used = new Map<string, number>(openDays.map((d) => [d.date, 0])); // date -> minutes spent
  const placedJars = new Map<string, Map<string, number>>(); // date -> productId -> jars

  const freeMinutes = (day: PlanDay, cap: number) =>
    Math.min(day.capacity, cap) - (used.get(day.date) ?? 0);

  const record = (day: PlanDay, job: Job, jars: number) => {
    used.set(day.date, (used.get(day.date) ?? 0) + jars * job.minutesPerUnit);
    const byProduct = placedJars.get(day.date) ?? new Map<string, number>();
    byProduct.set(job.productId, (byProduct.get(job.productId) ?? 0) + jars);
    placedJars.set(day.date, byProduct);

    const need = needs.find((n) => n.productId === job.productId);
    if (!need) return;
    need.jarsScheduled += jars;
    if (day.date > job.deadline) need.jarsLate += jars;
    else if (daysBetween(day.date, job.deadline) > job.shelfLife) need.jarsExpiring += jars;
  };

  /** The days this job should try, best first. */
  function candidates(job: Job): PlanDay[] {
    const before = openDays.filter((d) => d.date <= job.deadline);
    const after = openDays.filter((d) => d.date > job.deadline);
    // Min expiry works backwards from the deadline so jars are as fresh as possible;
    // the others work forwards. Either way, missing the deadline is the last resort.
    return input.strategy === "min_expiry" ? [...before.reverse(), ...after] : [...before, ...after];
  }

  // A jar can only be placed where its minutes fit, so jobs with no recorded time are set
  // aside rather than silently treated as instant.
  const schedulable = jobs.filter((j) => j.minutesPerUnit > 0);
  let jarsUnscheduled = jobs.filter((j) => j.minutesPerUnit <= 0).reduce((s, j) => s + j.jars, 0);

  const ordered =
    input.strategy === "min_expiry"
      ? [...schedulable].sort((a, b) => a.shelfLife - b.shelfLife || b.deadline.localeCompare(a.deadline))
      : [...schedulable].sort((a, b) => a.deadline.localeCompare(b.deadline));

  // Balanced caps each day at an even share of the total work; a deadline still beats
  // evenness, so the cap is lifted once the capped days can take no more.
  const totalMinutes = schedulable.reduce((s, j) => s + j.jars * j.minutesPerUnit, 0);
  const lastDeadline = ordered.at(-1)?.deadline ?? today;
  const usableDays = openDays.filter((d) => d.date <= lastDeadline).length || openDays.length;
  const evenCap = input.strategy === "balanced" && usableDays > 0 ? Math.ceil(totalMinutes / usableDays) : Infinity;

  for (const job of ordered) {
    let left = job.jars;
    for (const pass of [evenCap, Infinity]) {
      if (left <= 0) break;
      for (const day of candidates(job)) {
        if (left <= 0) break;
        const fits = Math.floor(freeMinutes(day, pass) / job.minutesPerUnit);
        if (fits <= 0) continue;
        const take = Math.min(left, fits);
        record(day, job, take);
        left -= take;
      }
      if (pass === Infinity) break;
    }
    jarsUnscheduled += left;
  }

  const productById = new Map(input.products.map((p) => [p.id, p]));
  for (const day of days) {
    const byProduct = placedJars.get(day.date);
    if (!byProduct) continue;
    day.runs = [...byProduct.entries()].map(([productId, jars]) => {
      const product = productById.get(productId);
      return {
        productId,
        productName: product?.name ?? "Unknown product",
        jars,
        minutes: jars * (product ? minutesPerUnitOf(product) : 0),
      };
    });
  }

  // --- Ingredients for everything that needs making (raw cacao scaled up by utilization) ----
  // Counted per jar rather than per batch, and against what has to be made rather than what
  // the calendar managed to place: with no equipment set up nothing is ever placed, and a
  // shopping list that empties itself in exactly that case is worse than useless — that's
  // when you most need to know what to buy.
  const required = new Map<string, number>();
  for (const need of needs) {
    if (need.jarsToMake <= 0) continue;
    const product = productById.get(need.productId);
    if (!product || product.batchYield <= 0) continue;
    for (const row of product.recipeIngredients) {
      const material = input.rawMaterials.find((m) => m.id === row.materialId);
      // Recipes are written per batch, so a jar's share is the row divided by the yield.
      const perJar = row.quantity / product.batchYield;
      const rawQty = rawQuantityNeeded(material?.name ?? "", perJar, input.cacaoUtilization);
      required.set(row.materialId, (required.get(row.materialId) ?? 0) + rawQty * need.jarsToMake);
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

  return {
    days,
    needs,
    ingredientNeeds,
    forecasts,
    totalJarsToMake: needs.reduce((s, n) => s + n.jarsToMake, 0),
    totalJarsScheduled: needs.reduce((s, n) => s + n.jarsScheduled, 0),
    totalMinutesNeeded: needs.reduce((s, n) => s + n.minutesNeeded, 0),
    jarsLate: needs.reduce((s, n) => s + n.jarsLate, 0),
    jarsExpiring: needs.reduce((s, n) => s + n.jarsExpiring, 0),
    jarsUnscheduled,
    hasEquipment: input.machines.some((m) => m.hoursPerDay > 0 && m.workingDaysPerWeek > 0),
    productsMissingMinutes: needs.filter((n) => n.missingMinutes).map((n) => n.productName),
  };
}
