import { dueInfo, outstanding, termOf } from "@/lib/transactions/ledger";
import type { BusinessEvent, Entry, EventStockMovement, Product } from "@/lib/store/types";
import type { PlanDay } from "@/lib/summary/production-schedule";
import type { StockLot } from "@/lib/summary/product-lots";

/**
 * Everything the Calendar shows, worked out from records that already exist — nothing here
 * is stored, so nothing here can disagree with the tab it came from:
 *
 *   production  the suggested schedule (summary/production-schedule), one entry per product per day
 *   events      Events with dates, and what is planned for them
 *   shipments   stock sent out to, or back from, an event or distributor (Event Stock)
 *   dayoffs     days marked off on the production calendar
 *   payments    payables and receivables still owed, on their due date (Transactions)
 *   alerts      stock at or below its warning level, batches expiring, ingredients short
 *
 * Pure: no store, no React. The screen passes in what it has; an employee's copy of the data
 * carries no payment terms, so it simply produces no payment entries.
 */

export type CalendarCategory = "production" | "events" | "shipments" | "dayoffs" | "payments" | "alerts";

export const CATEGORY_LABELS: Record<CalendarCategory, string> = {
  production: "Production",
  events: "Events & orders",
  shipments: "Shipments",
  dayoffs: "Day-offs",
  payments: "Payments",
  alerts: "Alerts",
};

export type EntryTone = "neutral" | "good" | "warn" | "bad";

export interface CalendarEntry {
  id: string;
  category: CalendarCategory;
  /** "YYYY-MM-DD" — the day it shows on (the first day, for an event that spans several). */
  date: string;
  /** Last day, inclusive, for entries that span days. */
  endDate?: string;
  title: string;
  subtitle?: string;
  /** Label/value lines for the detail sheet; a line with an href opens that record. */
  details: { label: string; value: string; href?: string }[];
  tone: EntryTone;
  /** Where the record lives, for "Open in …". */
  href?: string;
  hrefLabel?: string;
}

export interface CalendarInput {
  today: string;
  products: Product[];
  planDays: PlanDay[];
  events: BusinessEvent[];
  eventPlans: Record<string, Record<string, number>>;
  eventStock: EventStockMovement[];
  unavailableDays: string[];
  entries: Entry[];
  /** Batches per product (summary/product-lots), for expiry. */
  lotsByProduct: Record<string, StockLot[]>;
  expiringWithinDays: number;
  ingredientShortages: { name: string; short: number; unit: string }[];
  /** What won't be ready by the day it's needed. */
  late: { name: string; qty: number; unit: string }[];
  now: Date;
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const peso = (n: number) => `₱${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function nameOf(products: Product[], productId: string): string {
  const p = products.find((x) => x.id === productId);
  if (!p) return "A product no longer in Costing";
  const head = p.sizeOfId ? products.find((x) => x.id === p.sizeOfId) : undefined;
  const family = head?.name ?? p.name;
  return p.sizeLabel ? `${family} · ${p.sizeLabel}` : family;
}

const unitOf = (products: Product[], productId: string) => products.find((p) => p.id === productId)?.unit || "jar";

export function buildCalendarEntries(input: CalendarInput): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  const { products, today } = input;

  // Production — the suggested plan, never presented as a commitment.
  for (const day of input.planDays) {
    for (const run of day.runs) {
      const name = run.kind === "product" ? nameOf(products, run.itemId) : run.name;
      const amount = run.kind === "product" ? plural(run.qty, unitOf(products, run.itemId)) : `${run.qty} ${run.unit}`;
      out.push({
        id: `production:${day.date}:${run.itemId}`,
        category: "production",
        date: day.date,
        title: `Make ${name}`,
        subtitle: `${amount} · suggested`,
        details: [
          { label: "Makes", value: amount },
          { label: "Status", value: "Suggested by the production plan — not yet scheduled" },
        ],
        tone: "neutral",
        href: "/production#what-to-make",
        hrefLabel: "See what to make in Production",
      });
    }
  }

  // Events and what's planned for them.
  for (const event of input.events) {
    if (!event.startDate) continue; // open-ended distributors have no day to sit on
    const start = event.startDate.slice(0, 10);
    const end = event.endDate ? event.endDate.slice(0, 10) : start;
    const plan = Object.entries(input.eventPlans[event.id] ?? {}).filter(([, qty]) => qty > 0);
    out.push({
      id: `event:${event.id}`,
      category: "events",
      date: start,
      endDate: end > start ? end : undefined,
      title: event.name,
      subtitle: plan.length ? `${plural(plan.length, "product")} planned` : event.kind === "distributor" ? "Distributor" : "Event",
      details: [
        { label: "Type", value: event.kind === "distributor" ? "Distributor" : "Event" },
        { label: "Dates", value: end > start ? `${start} to ${end}` : start },
        { label: "Status", value: event.status === "open" ? "Open" : "Closed" },
        // Each product links to its card in Costing, which is the product list — an event never
        // keeps its own copy of a product's name or size.
        ...plan.map(([productId, qty]) => ({
          label: nameOf(products, productId),
          value: plural(qty, unitOf(products, productId)),
          href: products.some((p) => p.id === productId) ? `/costing?product=${productId}` : "/costing",
        })),
        ...(event.notes ? [{ label: "Notes", value: event.notes }] : []),
      ],
      tone: event.status === "open" ? "good" : "neutral",
    });
  }

  // Shipments — stock that actually went out or came back.
  const eventName = (id: string) => input.events.find((e) => e.id === id)?.name ?? "an event";
  for (const move of input.eventStock) {
    const out_ = move.type === "sent_out";
    const qty = plural(move.quantity, unitOf(products, move.productId));
    out.push({
      id: `shipment:${move.id}`,
      category: "shipments",
      date: move.createdAt.slice(0, 10),
      title: `${out_ ? "Sent" : "Came back"}: ${qty} ${nameOf(products, move.productId)}`,
      subtitle: `${out_ ? "to" : "from"} ${eventName(move.eventId)}`,
      details: [
        { label: "Product", value: nameOf(products, move.productId) },
        { label: "Quantity", value: qty },
        { label: out_ ? "Sent to" : "Back from", value: eventName(move.eventId) },
      ],
      tone: "neutral",
    });
  }

  // Day-offs.
  for (const date of input.unavailableDays) {
    out.push({
      id: `dayoff:${date}`,
      category: "dayoffs",
      date,
      title: "Day off",
      subtitle: "No production planned",
      details: [{ label: "What it means", value: "The production plan leaves this day empty." }],
      tone: "neutral",
    });
  }

  // Payments still owed, on their due date. Read-only: they live in Transactions.
  for (const e of input.entries) {
    const term = termOf(e);
    if (term === "spot" || !e.dueDate) continue;
    const owed = outstanding(e);
    if (owed <= 0) continue;
    const due = dueInfo(e, input.now);
    const receivable = term === "receivable";
    const who = e.counterparty || (receivable ? "a customer" : "a supplier");
    out.push({
      id: `payment:${e.id}`,
      category: "payments",
      date: e.dueDate,
      title: `${receivable ? "To collect" : "To pay"}: ${peso(owed)}`,
      subtitle: `${receivable ? "from" : "to"} ${who}${due.overdue ? ` · ${plural(-(due.daysLeft ?? 0), "day")} overdue` : ""}`,
      details: [
        { label: receivable ? "Owed to you by" : "You owe", value: who },
        { label: "Still owed", value: peso(owed) },
        ...(e.amount != null ? [{ label: "Original amount", value: peso(e.amount) }] : []),
        { label: "Due", value: e.dueDate },
        ...(e.sku ? [{ label: "For", value: e.sku }] : []),
      ],
      tone: due.overdue ? "bad" : "warn",
      href: "/transactions",
      hrefLabel: "Open in Transactions",
    });
  }

  // Alerts.
  for (const p of products) {
    if (p.lowStockThreshold > 0 && p.stockQty <= p.lowStockThreshold) {
      out.push({
        id: `alert:low:${p.id}`,
        category: "alerts",
        date: today,
        title: `Low: ${nameOf(products, p.id)}`,
        subtitle: `${plural(p.stockQty, p.unit || "jar")} left`,
        details: [
          { label: "On hand", value: plural(p.stockQty, p.unit || "jar") },
          { label: "Warning level", value: String(p.lowStockThreshold) },
        ],
        tone: p.stockQty <= 0 ? "bad" : "warn",
        href: "/production#what-to-make",
        hrefLabel: "See what to make in Production",
      });
    }
    for (const lot of input.lotsByProduct[p.id] ?? []) {
      if (lot.qty <= 0 || lot.daysLeft > input.expiringWithinDays) continue;
      const past = lot.daysLeft < 0;
      out.push({
        id: `alert:expiry:${p.id}:${lot.madeOn}`,
        category: "alerts",
        // Past-date stock is a problem today; stock about to expire shows on its date.
        date: past ? today : lot.expiresOn,
        title: `${past ? "Past its date" : "Expires"}: ${nameOf(products, p.id)}`,
        subtitle: plural(lot.qty, p.unit || "jar"),
        details: [
          { label: "Made on", value: lot.madeOn },
          { label: "Good until", value: lot.expiresOn },
          { label: "Quantity", value: plural(lot.qty, p.unit || "jar") },
        ],
        tone: past ? "bad" : "warn",
        href: "/production",
        hrefLabel: "Open Production",
      });
    }
  }
  for (const s of input.ingredientShortages) {
    if (s.short <= 0) continue;
    out.push({
      id: `alert:short:${s.name}`,
      category: "alerts",
      date: today,
      title: `Buy more: ${s.name}`,
      subtitle: `${s.short} ${s.unit} short for the plan`,
      details: [{ label: "Short by", value: `${s.short} ${s.unit}` }],
      tone: "warn",
      href: "/production#what-to-buy",
      hrefLabel: "See what to buy in Production",
    });
  }
  for (const late of input.late) {
    if (late.qty <= 0) continue;
    out.push({
      id: `alert:late:${late.name}`,
      category: "alerts",
      date: today,
      title: `Won't be ready in time: ${late.name}`,
      subtitle: `${late.qty} ${late.unit} late`,
      details: [{ label: "Why", value: "Not enough production days before it's needed. Free up days or add a machine." }],
      tone: "bad",
      href: "/production#what-to-make",
      hrefLabel: "See what to make in Production",
    });
  }

  return out;
}

/** Does this entry show on `date`? Multi-day entries show on every day they cover. */
export function coversDay(entry: CalendarEntry, date: string): boolean {
  return entry.endDate ? entry.date <= date && date <= entry.endDate : entry.date === date;
}
