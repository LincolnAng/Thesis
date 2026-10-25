import { installmentSchedule, outstanding, termOf } from "@/lib/transactions/ledger";
import type { AgendaKind, BusinessEvent, CalendarItem, Entry, EventStockMovement, Product, TimeRecord } from "@/lib/store/types";
import type { Holiday } from "@/lib/calendar/holidays";
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
 *   leaves      staff on leave (Salaries' time record), one entry per run of days
 *   agenda      what people put on the calendar themselves — events, tasks, meetings,
 *               deadlines — their own and what was shared with them
 *   holidays    Philippine regular and special holidays
 *   payments    payables and receivables still owed, on their due date (Transactions)
 *   alerts      stock at or below its warning level, batches expiring, ingredients short
 *
 * Pure: no store, no React. The screen passes in what it has; an employee's copy of the data
 * carries no payment terms, so it simply produces no payment entries.
 */

export type CalendarCategory = "agenda" | "production" | "events" | "shipments" | "dayoffs" | "leaves" | "payments" | "alerts" | "holidays";

export const CATEGORY_LABELS: Record<CalendarCategory, string> = {
  production: "Production",
  events: "Events & orders",
  shipments: "Shipments",
  agenda: "My calendar",
  holidays: "Holidays",
  dayoffs: "Day-offs",
  leaves: "Leaves",
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
  /** Agenda items: their own colour (by kind), time, and the item itself for editing. */
  color?: string;
  startTime?: string | null;
  item?: CalendarItem;
}

export const AGENDA_KINDS: { kind: AgendaKind; label: string; color: string }[] = [
  { kind: "event", label: "Event", color: "#1A73E8" },
  { kind: "task", label: "Task", color: "#0B8043" },
  { kind: "meeting", label: "Meeting", color: "#F4511E" },
  { kind: "delivery", label: "Delivery deadline", color: "#039BE5" },
  { kind: "receivable", label: "Collect payment", color: "#33B679" },
  { kind: "payable", label: "Payment due", color: "#D50000" },
  { kind: "reminder", label: "Reminder", color: "#616161" },
];
export const agendaKind = (k: AgendaKind) => AGENDA_KINDS.find((a) => a.kind === k) ?? AGENDA_KINDS[0];

/** "14:30" → "2:30 PM" */
export function clock(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
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
  /** Leave days from the time record, and whose they are. An employee's copy holds only their own. */
  timeRecords?: TimeRecord[];
  staff?: { id: string; name: string }[];
  /** What the signed-in person may see of the calendar's own items (already filtered). */
  calendarItems?: CalendarItem[];
  holidays?: Holiday[];
}

/** Days off work in a row ("2026-10-05", "-06", "-07") become one leave, with its note. */
export function leaveRuns(records: TimeRecord[]): { staffId: string; start: string; end: string; dates: string[]; note: string }[] {
  const next = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    const t = new Date(y, m - 1, d + 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  const byStaff = new Map<string, TimeRecord[]>();
  for (const r of records) if (r.status === "leave") byStaff.set(r.staffId, [...(byStaff.get(r.staffId) ?? []), r]);
  const runs: { staffId: string; start: string; end: string; dates: string[]; note: string }[] = [];
  for (const [staffId, list] of byStaff) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    for (const r of sorted) {
      const last = runs.at(-1);
      if (last && last.staffId === staffId && next(last.end) === r.date && (r.note || "") === last.note) {
        last.end = r.date;
        last.dates.push(r.date);
      } else runs.push({ staffId, start: r.date, end: r.date, dates: [r.date], note: r.note || "" });
    }
  }
  return runs;
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const cents2 = (n: number) => Math.round(n * 100) / 100;
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

  // Payments still owed, on their due date — or, for instalments, each unpaid instalment on its
  // own date. Read-only: they live in Transactions.
  for (const e of input.entries) {
    const term = termOf(e);
    if (term === "spot") continue;
    const owed = outstanding(e);
    if (owed <= 0) continue;
    const receivable = term === "receivable";
    const who = e.counterparty || (receivable ? "a customer" : "a supplier");
    const plan = e.installments ? installmentSchedule(e).filter((i) => !i.paid) : null;
    const dues = plan
      ? plan.map((i) => ({ date: i.date, amount: cents2(i.amount - i.covered), label: `instalment ${i.n} of ${e.installments!.count}` }))
      : e.dueDate
        ? [{ date: e.dueDate, amount: owed, label: "" }]
        : [];
    for (const due of dues) {
      const daysLate = Math.round((new Date(`${input.today}T00:00:00`).getTime() - new Date(`${due.date}T00:00:00`).getTime()) / 86_400_000);
      out.push({
        id: `payment:${e.id}${plan ? `:${due.date}` : ""}`,
        category: "payments",
        date: due.date,
        title: `${receivable ? "To collect" : "To pay"}: ${peso(due.amount)}`,
        subtitle: `${receivable ? "from" : "to"} ${who}${daysLate > 0 ? ` · ${plural(daysLate, "day")} overdue` : ""}${due.label ? ` · ${due.label}` : ""}`,
        details: [
          { label: receivable ? "Owed to you by" : "You owe", value: who },
          { label: due.label ? "This instalment" : "Still owed", value: peso(due.amount) },
          ...(due.label ? [{ label: "Still owed in all", value: peso(owed) }] : []),
          ...(e.amount != null ? [{ label: "Original amount", value: peso(e.amount) }] : []),
          { label: "Due", value: due.date },
          ...(e.paymentMethod === "check" ? [{ label: "Paid by", value: `Check${e.bankName ? ` · ${e.bankName}` : ""}` }] : []),
          ...(e.sku ? [{ label: "For", value: e.sku }] : []),
        ],
        tone: daysLate > 0 ? "bad" : "warn",
        href: "/transactions",
        hrefLabel: "Open in Transactions",
      });
    }
  }


  // The calendar's own items.
  for (const it of input.calendarItems ?? []) {
    const k = agendaKind(it.kind);
    const time = it.startTime ? `${clock(it.startTime)}${it.endTime ? `–${clock(it.endTime)}` : ""}` : "All day";
    out.push({
      id: `agenda:${it.id}`,
      category: "agenda",
      date: it.date,
      endDate: it.endDate && it.endDate > it.date ? it.endDate : undefined,
      title: it.title || k.label,
      subtitle: [time, it.location || null, k.label].filter(Boolean).join(" · "),
      details: [
        { label: "Kind", value: k.label },
        { label: "When", value: it.endDate && it.endDate > it.date ? `${it.date} to ${it.endDate}` : `${it.date} · ${time}` },
        ...(it.location ? [{ label: "Where", value: it.location }] : []),
        ...(it.notes ? [{ label: "Notes", value: it.notes }] : []),
        { label: "Added by", value: it.ownerName || "—" },
      ],
      tone: it.done ? "good" : it.kind === "payable" ? "warn" : "neutral",
      color: k.color,
      startTime: it.startTime,
      item: it,
    });
  }

  // Holidays.
  for (const h of input.holidays ?? []) {
    out.push({
      id: `holiday:${h.date}:${h.name}`,
      category: "holidays",
      date: h.date,
      title: h.name,
      subtitle: h.localName !== h.name ? h.localName : undefined,
      details: [{ label: "Holiday", value: h.localName !== h.name ? `${h.name} (${h.localName})` : h.name }],
      tone: "neutral",
    });
  }

  // Leaves.
  for (const run of leaveRuns(input.timeRecords ?? [])) {
    const name = input.staff?.find((s) => s.id === run.staffId)?.name ?? "Someone";
    out.push({
      id: `leave:${run.staffId}:${run.start}`,
      category: "leaves",
      date: run.start,
      endDate: run.end > run.start ? run.end : undefined,
      title: `On leave: ${name}`,
      subtitle: [run.dates.length > 1 ? plural(run.dates.length, "day") : null, run.note || null].filter(Boolean).join(" · ") || undefined,
      details: [
        { label: "Who", value: name },
        { label: "Dates", value: run.end > run.start ? `${run.start} to ${run.end}` : run.start },
        ...(run.note ? [{ label: "Reason", value: run.note }] : []),
      ],
      tone: "neutral",
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
