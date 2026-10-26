import { forecastAll, type ProductForecast } from "@/lib/summary/forecast";
import { rawQuantityNeeded } from "@/lib/summary/cacao";
import { unitsPerBatch } from "@/lib/costing/per-unit";
import { hasEquipment, makersOf, runsOn } from "@/lib/production/machines";
import type { BusinessEvent, Entry, Machine, Product, RawMaterialStock } from "@/lib/store/types";

/**
 * Turns next month's forecast (plus whatever the owner plans to bring to events) into a
 * day-by-day production calendar.
 *
 * Work is counted in the item's own unit (jars, kg), and each machine says how many of what it
 * makes in an hour or a day. A machine that makes several things splits its day between them.
 * Everything to make carries a deadline — the end of this month for forecast demand, the day
 * before the event for event stock — and the chosen strategy decides which days it lands on.
 * Raw materials a machine makes (nibs from a grinder) are scheduled too when they're short, on
 * days of their own: a day is either a roasting/grinding day or a production day, never both.
 */

export type ScheduleStrategy = "fastest" | "balanced" | "min_expiry";

export const STRATEGY_LABELS: Record<ScheduleStrategy, string> = {
  fastest: "Fastest",
  balanced: "Balanced",
  min_expiry: "Latest Start",
};

export const STRATEGY_HINTS: Record<ScheduleStrategy, string> = {
  fastest: "Everything as early as possible, so the target is done in the fewest days.",
  balanced: "The same amount of work spread evenly across the days available.",
  min_expiry: "Made as close to when it's needed as possible — shortest shelf life last.",
};

export type DayStatus = "past" | "unavailable" | "no_equipment" | "open";

export interface ScheduledRun {
  /** A product's id, or a raw material's when `kind` is "material". */
  itemId: string;
  kind: "product" | "material";
  name: string;
  qty: number;
  unit: string;
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  status: DayStatus;
  capacity: number; // machines running that day (0 unless open)
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
  /** No machine says it makes this, so none of it can go on the calendar. */
  noMachine: boolean;
}

export interface IngredientNeed {
  materialId: string;
  name: string;
  unit: string;
  required: number;
  onHand: number;
  short: number;
  /** A machine makes it, so what's short is scheduled rather than bought. */
  madeInHouse: boolean;
}

/** An amount of one item, for saying what's late, early or has nowhere to go. */
export interface ItemQty {
  itemId: string;
  name: string;
  qty: number;
  unit: string;
}

export interface ProductionPlan {
  days: PlanDay[];
  needs: ProductNeed[];
  ingredientNeeds: IngredientNeed[];
  forecasts: ProductForecast[];
  totalJarsToMake: number;
  totalJarsScheduled: number;
  /** Placed after the day it's needed. */
  late: ItemQty[];
  /** Placed so early it would be past its shelf life when it's needed. */
  expiring: ItemQty[];
  /** Has a machine, but the days ran out before all of it fit. */
  unplaced: ItemQty[];
  /** Needs making, but no machine makes it. */
  noMachine: ItemQty[];
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
  /** Seasonal multipliers per product, so next month's forecast reflects the calendar. */
  seasonMultipliers?: (productId: string) => number[] | undefined;
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

interface DemandLine {
  productId: string;
  jars: number;
  deadline: string;
}

interface Job {
  itemId: string;
  kind: "product" | "material";
  name: string;
  unit: string;
  qty: number;
  deadline: string;
  shelfLife: number;
}

const EPS = 1e-6;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildProductionPlan(input: PlanInput): ProductionPlan {
  const now = input.now ?? new Date();
  const today = toIsoDate(now);
  const endOfMonth = toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  // The calendar runs through next month so late work still has somewhere to land.
  const windowEnd = toIsoDate(new Date(now.getFullYear(), now.getMonth() + 2, 0));

  const forecasts = forecastAll(input.products, input.entries, now, input.seasonMultipliers);

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

  // --- Jobs: stock on hand covers the earliest deadlines first, the rest is to make ---------
  const jobs: Job[] = [];
  const needs: ProductNeed[] = input.products.map((product) => {
    const lines = [...(linesByProduct.get(product.id) ?? [])].sort((a, b) => a.deadline.localeCompare(b.deadline));
    const forecastQty = forecasts.find((f) => f.productId === product.id)?.forecastQty ?? 0;
    const eventQty = eventQtyByProduct.get(product.id) ?? 0;
    let stock = Math.max(0, product.stockQty);
    let jarsToMake = 0;

    for (const line of lines) {
      const fromStock = Math.min(stock, line.jars);
      stock -= fromStock;
      const remaining = Math.ceil(line.jars - fromStock - EPS);
      if (remaining <= 0) continue;
      jarsToMake += remaining;
      jobs.push({
        itemId: product.id,
        kind: "product",
        name: product.name,
        unit: product.unit || "jars",
        qty: remaining,
        deadline: line.deadline,
        shelfLife: input.shelfLifeDays(product.id),
      });
    }

    return {
      productId: product.id,
      productName: product.name,
      forecastQty,
      eventQty,
      onHand: product.stockQty,
      jarsToMake,
      noMachine: jarsToMake > 0 && makersOf(input.machines, product.id).length === 0,
    };
  });

  // --- Ingredients for everything that needs making (raw cacao scaled up by utilization) ----
  // Counted against what has to be made, not against what the calendar managed to place: with
  // no equipment set up nothing is ever placed, and a shopping list that empties itself in
  // exactly that case is worse than useless — that's when you most need to know what to buy.
  const productById = new Map(input.products.map((p) => [p.id, p]));
  const required = new Map<string, number>();
  for (const need of needs) {
    const product = productById.get(need.productId);
    if (!product || need.jarsToMake <= 0) continue;
    for (const row of product.recipeIngredients) {
      const material = input.rawMaterials.find((m) => m.id === row.materialId);
      const rawQty = rawQuantityNeeded(material?.name ?? "", row.quantity, input.cacaoUtilization);
      required.set(row.materialId, (required.get(row.materialId) ?? 0) + (rawQty / unitsPerBatch(product)) * need.jarsToMake);
    }
  }
  const ingredientNeeds: IngredientNeed[] = [...required.entries()]
    .map(([materialId, qty]) => {
      const material = input.rawMaterials.find((m) => m.id === materialId);
      const onHand = material?.qty ?? 0;
      return {
        materialId,
        name: material?.name ?? "Unknown ingredient",
        unit: material?.unit ?? "",
        required: round2(qty),
        onHand,
        short: Math.max(0, round2(qty - onHand)),
        madeInHouse: makersOf(input.machines, materialId).length > 0,
      };
    })
    .sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));
  // What a machine here makes is made, not bought — and ready before the first product needs it.
  const firstNeed = jobs.reduce((min, j) => (j.deadline < min ? j.deadline : min), endOfMonth);
  for (const n of ingredientNeeds.filter((x) => x.madeInHouse && x.short > 0)) {
    jobs.push({ itemId: n.materialId, kind: "material", name: n.name, unit: n.unit, qty: n.short, deadline: firstNeed, shelfLife: Infinity });
  }

  // --- Calendar ---------------------------------------------------------------------------
  const days: PlanDay[] = [];
  const dateOf = new Map<string, Date>();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let d = new Date(start); toIsoDate(d) <= windowEnd; d.setDate(d.getDate() + 1)) {
    const iso = toIsoDate(d);
    dateOf.set(iso, new Date(d));
    const running = input.machines.filter((m) => runsOn(m, d)).length;
    const status: DayStatus =
      iso < today ? "past" : input.unavailable.has(iso) ? "unavailable" : running <= 0 ? "no_equipment" : "open";
    days.push({
      date: iso,
      status,
      capacity: status === "open" ? running : 0,
      runs: [],
      eventNames: upcomingEvents.filter((e) => e.startDate?.slice(0, 10) === iso).map((e) => e.name),
    });
  }
  const openDays = days.filter((d) => d.status === "open");

  // Share of each machine's day already spent, by "date|machineId".
  const used = new Map<string, number>();
  const made = new Map<string, Map<string, number>>(); // date -> itemId -> qty
  const late = new Map<string, number>();
  const expiring = new Map<string, number>();
  const unplaced = new Map<string, number>();
  const jobById = new Map<string, Job>();
  // Roasting and grinding (raw materials) and making products never share a day.
  const kindOn = new Map<string, Job["kind"]>();
  const add = (m: Map<string, number>, id: string, qty: number) => m.set(id, (m.get(id) ?? 0) + qty);

  /** Makes as much of `job` as fits on `day`, each machine up to `cap` of its day. */
  const fill = (day: PlanDay, job: Job, wanted: number, cap: number): number => {
    const claimed = kindOn.get(day.date);
    if (claimed && claimed !== job.kind) return 0;
    let done = 0;
    for (const { machine, perDay } of makersOf(input.machines, job.itemId)) {
      if (wanted - done <= EPS) break;
      if (!runsOn(machine, dateOf.get(day.date) as Date)) continue;
      const key = `${day.date}|${machine.id}`;
      const room = cap - (used.get(key) ?? 0);
      if (room <= EPS) continue;
      let qty = Math.min(wanted - done, room * perDay);
      // A jar is made whole or not at all.
      if (job.kind === "product") qty = Math.floor(qty + EPS);
      if (qty <= EPS) continue;
      used.set(key, (used.get(key) ?? 0) + qty / perDay);
      done += qty;
    }
    if (done > EPS) {
      kindOn.set(day.date, job.kind);
      const forDay = made.get(day.date) ?? new Map<string, number>();
      add(forDay, job.itemId, done);
      made.set(day.date, forDay);
      if (day.date > job.deadline) add(late, job.itemId, done);
      else if (daysBetween(day.date, job.deadline) > job.shelfLife) add(expiring, job.itemId, done);
    }
    return done;
  };

  // Materials go before the products made from them; then earliest deadline first.
  const kindRank = (j: Job) => (j.kind === "material" ? 0 : 1);
  const placeable = jobs.filter((j) => makersOf(input.machines, j.itemId).length > 0);
  for (const j of jobs) jobById.set(j.itemId, j);

  const daysFor = (job: Job) =>
    input.strategy === "min_expiry"
      ? // Made as late as it can be and still be on time; anything that can't fit before its
        // deadline goes on the first free day after.
        [...openDays.filter((d) => d.date <= job.deadline).reverse(), ...openDays.filter((d) => d.date > job.deadline)]
      : openDays;

  let ordered: Job[];
  let cap = 1;
  if (input.strategy === "min_expiry") {
    // Shortest shelf life claims the latest slots before its deadline; longer-lasting goods fill in earlier.
    ordered = [...placeable].sort((a, b) => kindRank(b) - kindRank(a) || a.shelfLife - b.shelfLife || b.deadline.localeCompare(a.deadline));
  } else {
    // Raw materials first — the products are made from them — then earliest deadline first.
    ordered = [...placeable].sort((a, b) => kindRank(a) - kindRank(b) || a.deadline.localeCompare(b.deadline));
    if (input.strategy === "balanced") {
      // Every machine gets the same share of each day — the work spread evenly up to the last
      // deadline. A deadline always beats evenness: what doesn't fit under the cap goes uncapped.
      const lastDeadline = ordered.at(-1)?.deadline ?? today;
      const work = ordered.reduce((t, j) => t + j.qty / Math.max(...makersOf(input.machines, j.itemId).map((x) => x.perDay)), 0);
      const room = openDays.filter((d) => d.date <= lastDeadline).reduce((t, d) => t + d.capacity, 0);
      cap = room > 0 ? Math.min(1, (work / room) * 1.02) : 1;
    }
  }

  const left = new Map(ordered.map((j, i) => [i, j.qty]));
  for (const pass of cap < 1 ? [cap, 1] : [1]) {
    ordered.forEach((job, i) => {
      for (const day of daysFor(job)) {
        const want = left.get(i) ?? 0;
        if (want <= EPS) break;
        left.set(i, want - fill(day, job, want, pass));
      }
    });
  }
  ordered.forEach((job, i) => {
    const rest = left.get(i) ?? 0;
    if (rest > EPS) add(unplaced, job.itemId, rest);
  });

  for (const day of days) {
    const forDay = made.get(day.date);
    if (!forDay) continue;
    day.runs = [...forDay.entries()].map(([itemId, qty]) => {
      const job = jobById.get(itemId) as Job;
      return { itemId, kind: job.kind, name: job.name, qty: round2(qty), unit: job.unit };
    });
  }

  const listOf = (m: Map<string, number>): ItemQty[] =>
    [...m.entries()]
      .filter(([, qty]) => qty > EPS)
      .map(([itemId, qty]) => {
        const job = jobById.get(itemId) as Job;
        return { itemId, name: job.name, qty: round2(qty), unit: job.unit };
      });
  const noMachine = new Map<string, number>();
  for (const j of jobs.filter((x) => !placeable.includes(x))) add(noMachine, j.itemId, j.qty);

  return {
    days,
    needs,
    ingredientNeeds,
    forecasts,
    totalJarsToMake: needs.reduce((s, n) => s + n.jarsToMake, 0),
    totalJarsScheduled: days.reduce((s, d) => s + d.runs.filter((r) => r.kind === "product").reduce((r, run) => r + run.qty, 0), 0),
    late: listOf(late),
    expiring: listOf(expiring),
    unplaced: listOf(unplaced),
    noMachine: listOf(noMachine),
    hasEquipment: hasEquipment(input.machines),
  };
}
