import type { Entry, Product, Role } from "@/lib/store/types";

/**
 * What Home says before anyone asks: four plain figures for today, and a short list of
 * headliners — the few things worth acting on, most urgent first.
 *
 * Home used to open on charts. A chart answers "what happened" only for someone who can read
 * one, and never says "so do this". Each headliner here is a sentence with its figure and a
 * link to the page where she acts on it.
 *
 * Pure: everything it needs is passed in, so it can be tested without a store or a sheet.
 * Nothing is ever guessed — a figure that can't be worked out (a product with no cost yet)
 * says so instead of showing a number.
 */

export interface LowMaterial {
  name: string;
  onHand: number;
  threshold: number;
  unit: string;
}

export interface ProductOutlook {
  productId: string;
  productName: string;
  /** Expected to sell next month. 0 when there is no history to forecast from. */
  forecastQty: number;
}

export interface TodayInputs {
  now: Date;
  role: Role;
  entries: Entry[];
  products: Product[];
  /** Cost of one unit of this product, or null when its cost isn't fully known yet. */
  costPerUnit: (product: Product) => number | null;
  /** Ingredients and packaging at or below their restock level. */
  lowMaterials: LowMaterial[];
  outlook: ProductOutlook[];
}

/** A figure, or the reason it can't be shown. */
export type Figure = { value: number } | { unavailable: string };

export interface Glance {
  salesToday: number;
  salesCountToday: number;
  salesYesterday: number;
  /** Null for employees, who don't see expenses. */
  expensesToday: number | null;
  expenseCountToday: number;
  /** Null for employees. */
  netIncomeToday: Figure | null;
  inventoryAlerts: number;
}

export type HeadlinerTone = "urgent" | "watch" | "good" | "info";

export interface Headliner {
  id: string;
  tone: HeadlinerTone;
  title: string;
  detail: string;
  href: string;
  linkLabel: string;
}

const MONEY_OUT_TYPES = new Set(["EXPENSE", "RND"]);
const MAX_HEADLINERS = 6;

/** The device's own calendar day for an ISO timestamp, "YYYY-MM-DD". */
export function dayKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sum<T>(list: T[], f: (x: T) => number): number {
  return list.reduce((s, x) => s + f(x), 0);
}

function peso(n: number): string {
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

function onDay(entries: Entry[], key: string): Entry[] {
  return entries.filter((e) => dayKey(e.timestamp) === key);
}

function productFor(products: Product[], sku: string | null): Product | undefined {
  if (!sku) return undefined;
  const n = sku.trim().toLowerCase();
  return products.find((p) => p.name.trim().toLowerCase() === n);
}

/**
 * Sales less what the jars sold cost, less money spent and stock written off — the same
 * definition as the monthly profit trend, so Home and the charts never disagree. Unavailable
 * when any sale is of a product whose cost isn't known: a profit figure that quietly treats
 * an unknown cost as zero is the one number that would mislead.
 */
export function netIncome(entries: Entry[], products: Product[], costPerUnit: TodayInputs["costPerUnit"]): Figure {
  const sales = entries.filter((e) => e.type === "SALE");
  let cogs = 0;
  const missing = new Set<string>();
  for (const e of sales) {
    if (!e.quantity) continue;
    const product = productFor(products, e.sku);
    const cost = product ? costPerUnit(product) : null;
    if (cost == null) {
      missing.add(product?.name ?? e.sku ?? "an unnamed product");
      continue;
    }
    cogs += cost * e.quantity;
  }
  if (missing.size > 0) {
    const names = [...missing];
    return {
      unavailable: names.length > 1 ? `${names[0]} and ${names.length - 1} more have no cost yet` : `${names[0]} has no cost yet`,
    };
  }
  const revenue = sum(sales, (e) => e.amount ?? 0);
  const spent = sum(entries.filter((e) => MONEY_OUT_TYPES.has(e.type)), (e) => e.amount ?? 0);
  const spoiled = sum(entries.filter((e) => e.type === "WASTE"), (e) => e.amount ?? 0);
  return { value: revenue - cogs - spent - spoiled };
}

function lowProducts(products: Product[]): Product[] {
  return products.filter((p) => p.lowStockThreshold > 0 && p.stockQty <= p.lowStockThreshold);
}

export function computeGlance(input: TodayInputs): Glance {
  const exec = input.role === "executive";
  const today = dayKey(input.now);
  const yesterday = dayKey(new Date(input.now.getFullYear(), input.now.getMonth(), input.now.getDate() - 1));
  const todays = onDay(input.entries, today);
  const sales = todays.filter((e) => e.type === "SALE");
  const spent = todays.filter((e) => MONEY_OUT_TYPES.has(e.type));

  return {
    salesToday: sum(sales, (e) => e.amount ?? 0),
    salesCountToday: sales.length,
    salesYesterday: sum(
      onDay(input.entries, yesterday).filter((e) => e.type === "SALE"),
      (e) => e.amount ?? 0,
    ),
    expensesToday: exec ? sum(spent, (e) => e.amount ?? 0) : null,
    expenseCountToday: spent.length,
    netIncomeToday: exec ? netIncome(todays, input.products, input.costPerUnit) : null,
    inventoryAlerts: input.lowMaterials.length + lowProducts(input.products).length,
  };
}

// ── Headliners ────────────────────────────────────────────────────────────────

/** Entries from the 1st of the month containing `ref` up to the same day-of-month. */
function monthToDate(entries: Entry[], ref: Date, dayOfMonth: number): Entry[] {
  return entries.filter((e) => {
    const d = new Date(e.timestamp);
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() <= dayOfMonth;
  });
}

function inMonth(entries: Entry[], year: number, month: number): Entry[] {
  return entries.filter((e) => {
    const d = new Date(e.timestamp);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

function stockHeadliners(input: TodayInputs): Headliner[] {
  const out: Headliner[] = [];
  const forecastFor = new Map(input.outlook.map((o) => [o.productId, o.forecastQty]));

  if (input.lowMaterials.length > 0) {
    const [first, ...rest] = input.lowMaterials;
    out.push({
      id: "materials-low",
      tone: "urgent",
      title:
        rest.length === 0
          ? `Restock ${first.name}`
          : `${input.lowMaterials.length} ingredients and supplies need restocking`,
      detail:
        rest.length === 0
          ? `${first.onHand} ${first.unit} left — the restock level is ${first.threshold} ${first.unit}.`
          : `${input.lowMaterials
              .slice(0, 3)
              .map((m) => `${m.name} (${m.onHand} ${m.unit})`)
              .join(", ")}${input.lowMaterials.length > 3 ? ` and ${input.lowMaterials.length - 3} more` : ""}.`,
      href: "/production",
      linkLabel: "See stock",
    });
  }

  // One line per product that needs a batch: below its low-stock level, or short of what is
  // expected to sell next month.
  const needs = input.products
    .map((p) => ({ p, expected: forecastFor.get(p.id) ?? 0 }))
    .filter(({ p, expected }) => (p.lowStockThreshold > 0 && p.stockQty <= p.lowStockThreshold) || (expected > 0 && p.stockQty < expected))
    .sort((a, b) => a.p.stockQty / Math.max(1, a.expected, a.p.lowStockThreshold) - b.p.stockQty / Math.max(1, b.expected, b.p.lowStockThreshold));

  for (const { p, expected } of needs.slice(0, 2)) {
    const low = p.lowStockThreshold > 0 && p.stockQty <= p.lowStockThreshold;
    out.push({
      id: `produce-${p.id}`,
      tone: low ? "urgent" : "watch",
      title: `${p.name} needs production`,
      detail:
        expected > 0
          ? `Only ${p.stockQty} left, while about ${Math.round(expected)} are expected to sell next month. Check ingredients and schedule the next batch.`
          : `Only ${p.stockQty} left — at or below its low-stock level of ${p.lowStockThreshold}. Schedule the next batch.`,
      href: "/production",
      linkLabel: "Plan a batch",
    });
  }
  if (needs.length > 2) {
    out.push({
      id: "produce-more",
      tone: "watch",
      title: `${needs.length - 2} more products are running short`,
      detail: needs
        .slice(2, 5)
        .map(({ p }) => `${p.name} (${p.stockQty} left)`)
        .join(", "),
      href: "/production",
      linkLabel: "See production",
    });
  }
  return out;
}

function salesHeadliner(input: TodayInputs): Headliner | null {
  const day = input.now.getDate();
  const lastMonthRef = new Date(input.now.getFullYear(), input.now.getMonth() - 1, 1);
  // Compare like with like: the 1st to today, against the 1st to the same day last month.
  const sameDayLastMonth = Math.min(day, new Date(input.now.getFullYear(), input.now.getMonth(), 0).getDate());
  const now = sum(monthToDate(input.entries, input.now, day).filter((e) => e.type === "SALE"), (e) => e.amount ?? 0);
  const before = sum(
    monthToDate(input.entries, lastMonthRef, sameDayLastMonth).filter((e) => e.type === "SALE"),
    (e) => e.amount ?? 0,
  );
  if (now === 0 && before === 0) return null;
  if (before === 0) {
    return {
      id: "sales",
      tone: "good",
      title: `${peso(now)} in sales so far this month`,
      detail: "There were no sales by this day last month to compare with.",
      href: "/transactions",
      linkLabel: "See sales",
    };
  }
  const change = (now - before) / before;
  const pct = Math.round(Math.abs(change) * 100);
  return {
    id: "sales",
    tone: change < -0.15 ? "watch" : change > 0 ? "good" : "info",
    title: pct === 0 ? "Sales are level with last month" : `Sales are ${change > 0 ? "up" : "down"} ${pct}% on last month`,
    detail: `${peso(now)} so far this month, against ${peso(before)} by the same day last month.`,
    href: "/transactions",
    linkLabel: "See sales",
  };
}

function profitHeadliner(input: TodayInputs): Headliner {
  const monthEntries = monthToDate(input.entries, input.now, input.now.getDate());
  const result = netIncome(monthEntries, input.products, input.costPerUnit);
  if ("unavailable" in result) {
    return {
      id: "profit",
      tone: "watch",
      title: "This month's profit can't be worked out yet",
      detail: `${result.unavailable.charAt(0).toUpperCase()}${result.unavailable.slice(1)}. Add its recipe and ingredient prices in Costing.`,
      href: "/costing",
      linkLabel: "Open Costing",
    };
  }
  const revenue = sum(monthEntries.filter((e) => e.type === "SALE"), (e) => e.amount ?? 0);
  if (result.value < 0) {
    return {
      id: "profit",
      tone: "urgent",
      title: "Costs are ahead of sales this month",
      detail: `After product costs, expenses and spoilage, the month is ${peso(Math.abs(result.value))} short so far.`,
      href: "/transactions",
      linkLabel: "See transactions",
    };
  }
  return {
    id: "profit",
    tone: "good",
    title: `${peso(result.value)} earned after costs this month`,
    detail: revenue > 0 ? `That is ${Math.round((result.value / revenue) * 100)}% of the ${peso(revenue)} in sales.` : "No sales yet this month.",
    href: "/transactions",
    linkLabel: "See transactions",
  };
}

/** A category spending well above its usual month. Needs some history to say "usual". */
function expenseHeadliner(input: TodayInputs): Headliner | null {
  const y = input.now.getFullYear();
  const m = input.now.getMonth();
  const byCategory = (list: Entry[]) => {
    const out = new Map<string, number>();
    for (const e of list.filter((x) => x.type === "EXPENSE")) {
      const key = e.category ?? "misc";
      out.set(key, (out.get(key) ?? 0) + (e.amount ?? 0));
    }
    return out;
  };
  const current = byCategory(inMonth(input.entries, y, m));
  const history = [1, 2, 3].map((back) => byCategory(inMonth(input.entries, y, m - back)));
  const monthsWithData = history.filter((h) => h.size > 0).length;
  if (monthsWithData < 2) return null;

  let worst: { category: string; now: number; usual: number } | null = null;
  for (const [category, amount] of current) {
    const usual = sum(history, (h) => h.get(category) ?? 0) / monthsWithData;
    if (usual > 0 && amount > usual * 1.5 && amount - usual >= 500) {
      if (!worst || amount - usual > worst.now - worst.usual) worst = { category, now: amount, usual };
    }
  }
  if (!worst) return null;
  const label = worst.category.replace(/_/g, " ");
  return {
    id: "expense",
    tone: "watch",
    title: `Spending on ${label} is higher than usual`,
    detail: `${peso(worst.now)} this month, against about ${peso(worst.usual)} in a usual month.`,
    href: "/transactions",
    linkLabel: "See expenses",
  };
}

function bestSellerHeadliner(input: TodayInputs): Headliner | null {
  const sales = inMonth(input.entries, input.now.getFullYear(), input.now.getMonth()).filter((e) => e.type === "SALE" && e.sku);
  if (sales.length === 0) return null;
  const totals = new Map<string, { revenue: number; units: number }>();
  for (const e of sales) {
    const key = productFor(input.products, e.sku)?.name ?? (e.sku as string);
    const t = totals.get(key) ?? { revenue: 0, units: 0 };
    t.revenue += e.amount ?? 0;
    t.units += e.quantity ?? 0;
    totals.set(key, t);
  }
  const rows = [...totals.entries()];
  const byRevenue = [...rows].sort((a, b) => b[1].revenue - a[1].revenue)[0];
  const byUnits = [...rows].sort((a, b) => b[1].units - a[1].units)[0];
  const allRevenue = sum(rows, (r) => r[1].revenue);

  if (input.role !== "executive") {
    return {
      id: "best-seller",
      tone: "info",
      title: `${byUnits[0]} is selling the most this month`,
      detail: `${byUnits[1].units} sold so far.`,
      href: "/transactions",
      linkLabel: "See sales",
    };
  }
  const share = allRevenue > 0 ? Math.round((byRevenue[1].revenue / allRevenue) * 100) : 0;
  return {
    id: "best-seller",
    tone: "info",
    title: `${byRevenue[0]} is the best seller this month`,
    detail:
      `${share}% of sales by value (${peso(byRevenue[1].revenue)}).` +
      (byUnits[0] !== byRevenue[0] ? ` By units sold, ${byUnits[0]} leads with ${byUnits[1].units}.` : ""),
    href: "/transactions",
    linkLabel: "See sales",
  };
}

const TONE_ORDER: Record<HeadlinerTone, number> = { urgent: 0, watch: 1, good: 2, info: 3 };

/**
 * The few things worth her attention, most urgent first. Employees get the production and
 * stock ones (and what sells most, in units) — never profit, costs or expenses.
 */
export function computeHeadliners(input: TodayInputs): Headliner[] {
  const exec = input.role === "executive";
  const list: (Headliner | null)[] = [
    ...stockHeadliners(input),
    exec ? salesHeadliner(input) : null,
    exec ? profitHeadliner(input) : null,
    exec ? expenseHeadliner(input) : null,
    bestSellerHeadliner(input),
  ];
  return list
    .filter((h): h is Headliner => h !== null)
    .map((h, i) => ({ h, i }))
    .sort((a, b) => TONE_ORDER[a.h.tone] - TONE_ORDER[b.h.tone] || a.i - b.i)
    .map(({ h }) => h)
    .slice(0, MAX_HEADLINERS);
}
