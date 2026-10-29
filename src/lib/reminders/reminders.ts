import type { CalendarCategory, CalendarEntry } from "@/lib/calendar/entries";
import { clock, coversDay } from "@/lib/calendar/entries";
import { dayOf, outstanding, termOf } from "@/lib/transactions/ledger";
import type { Entry } from "@/lib/store/types";

/**
 * Today at a glance — the task list on Home. Built from the Calendar's own entries
 * (lib/calendar/entries), so the two always agree, plus what a calendar can't put on a single
 * day:
 *
 *   overdue    a payment past its due date stays here every day until it's paid, not only on
 *              the day it fell due;
 *   follow-up  money a customer owes with no due date, once it has been waiting two weeks.
 *
 * "Today" is everything that needs doing now, each written as a short instruction ("Collect
 * ₱800 from Ana"), with stock kept apart as stock alerts; "Coming up" is the next few days'
 * payments and events, so nothing due tomorrow is a surprise. Pure — no store, no React.
 */

export type ReminderTone = "bad" | "warn" | "info";

export interface Reminder {
  id: string;
  category: CalendarCategory | "followup" | "salaries";
  tone: ReminderTone;
  /** What to do, in a few plain words — "Collect ₱800 from Ana". */
  title: string;
  detail?: string;
  /** "YYYY-MM-DD" it's about — the due date, the event day. */
  date: string;
  href?: string;
  /** A calendar item behind it, so ticking it off can be saved. */
  itemId?: string;
}

/**
 * The headings Today at a glance groups its tasks under, in this order. Warnings are split by
 * what they ask for — make more, use up what's expiring, buy — rather than one "stock alerts"
 * pile; one that says production won't be ready in time goes under Production.
 */
export type ReminderGroup = "money" | "salaries" | "agenda" | "production" | "events" | "staff" | "low" | "expiring" | "buy" | "stock";
export const GROUP_LABELS: Record<ReminderGroup, string> = {
  money: "Money",
  salaries: "Salaries",
  agenda: "Calendar",
  production: "Production",
  events: "Events & holidays",
  staff: "Staff",
  low: "Running low",
  expiring: "Expiring",
  buy: "To buy",
  stock: "Other stock alerts",
};
export const GROUP_ORDER: ReminderGroup[] = ["money", "salaries", "agenda", "production", "events", "staff", "low", "expiring", "buy", "stock"];
/** The groups that are stock warnings rather than tasks. */
export const STOCK_GROUPS = new Set<ReminderGroup>(["low", "expiring", "buy", "stock"]);

export function groupOf(r: Reminder): ReminderGroup {
  switch (r.category) {
    case "payments":
    case "followup":
      return "money";
    case "salaries":
      return "salaries";
    case "agenda":
      return "agenda";
    case "production":
    case "dayoffs":
      return "production";
    case "events":
    case "holidays":
    case "shipments":
      return "events";
    case "leaves":
      return "staff";
    case "alerts":
      // Which warning it is lives in its id: alert:low:…, alert:expiry:…, alert:short:…, alert:late:…
      if (r.id.startsWith("alert:low:")) return "low";
      if (r.id.startsWith("alert:expiry:")) return "expiring";
      if (r.id.startsWith("alert:short:")) return "buy";
      if (r.id.startsWith("alert:late:")) return "production";
      return "stock";
  }
}

export interface Reminders {
  today: Reminder[];
  upcoming: Reminder[];
  /** Today's items that need action (not just information). */
  urgentCount: number;
}

export const COMING_UP_DAYS = 3;

/** Days nobody works — holidays and days marked off. Coming up shows these further ahead. */
export const isNoWork = (r: Pick<Reminder, "category">) => r.category === "holidays" || r.category === "dayoffs";

/** The last day of the month after `day`'s: how far ahead Coming up shows days off. */
export function endOfNextMonth(day: string): string {
  const [y, m] = day.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)); // day 0 of the month after next = last of next
  return last.toISOString().slice(0, 10);
}
export const FOLLOW_UP_AFTER_DAYS = 14;

const peso = (n: number) => `₱${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d + n);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  const [a, b] = [from, to].map((s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  });
  return Math.round((b - a) / 86_400_000);
}

const TONE: Record<CalendarEntry["tone"], ReminderTone> = { bad: "bad", warn: "warn", good: "info", neutral: "info" };

/** "Low: Cacao Tablea" → ["Low", "Cacao Tablea"] */
const split = (title: string): [string, string] => {
  const i = title.indexOf(": ");
  return i < 0 ? ["", title] : [title.slice(0, i), title.slice(i + 2)];
};

/** A calendar entry, said as the thing to do about it. */
function taskFor(e: CalendarEntry, today: string): Pick<Reminder, "title" | "detail"> {
  const [kind, what] = split(e.title);
  const sub = e.subtitle ?? "";
  switch (e.category) {
    case "payments": {
      // "To collect: ₱800" / "from Ana · 3 days overdue"
      // "from Ana · 3 days overdue · instalment 2 of 6"
      const [whoPart, ...rest] = sub.split(" · ");
      const who = whoPart.replace(/^(from|to) /, "");
      const notes = rest.map((r) => r.replace("overdue", "late"));
      if (e.date === today) notes.unshift("Due today");
      return {
        title: kind === "To collect" ? `Collect ${what} from ${who}` : `Pay ${who} ${what}`,
        detail: notes.join(" · ") || undefined,
      };
    }
    case "production":
      // "Make Tablea" / "2 batches · about 24 jars · suggested"
      return { title: `${e.title.replace(/^Make /, `Make ${sub.split(" · ")[0]} of `)}` };
    case "events":
      return { title: coversToday(e, today) ? `Event today: ${e.title}` : e.title };
    case "dayoffs":
      return { title: "Day off — no production" };
    case "leaves":
      return { title: coversToday(e, today) ? `${e.title.replace(/^On leave: /, "")} is on leave` : e.title };
    case "holidays":
      return { title: `Holiday: ${e.title}` };
    case "agenda": {
      const it = e.item;
      if (!it) return { title: e.title };
      const at = it.startTime ? clock(it.startTime) : "";
      const late = !it.done && (it.endDate ?? it.date) < today;
      const verb: Record<string, string> = { event: "", task: "", meeting: "Meet: ", delivery: "Deliver: ", receivable: "Collect: ", payable: "Pay: ", reminder: "" };
      return {
        title: `${verb[it.kind] ?? ""}${e.title}${at ? ` at ${at}` : ""}`,
        detail: [late ? "Late" : null, it.location || null, it.ownerName && it.visibility !== "private" ? `from ${it.ownerName}` : null].filter(Boolean).join(" · ") || undefined,
      };
    }
    case "alerts":
      if (kind === "Low") return { title: /^0 /.test(sub) ? `Out of ${what} — make more` : `Make more ${what}`, detail: sub };
      if (kind === "Past its date") return { title: `Check ${what} — past its date`, detail: sub };
      if (kind === "Expires") return { title: `Sell ${what} first — expiring`, detail: sub };
      if (kind === "Buy more") return { title: `Buy ${what}`, detail: sub.replace(" for the plan", "") };
      if (kind === "Won't be ready in time") return { title: `${what} won't be ready in time`, detail: "Add production days" };
      return { title: e.title, detail: sub || undefined };
    default:
      return { title: e.title, detail: sub || undefined };
  }
}

const coversToday = (e: CalendarEntry, today: string) => coversDay(e, today);

function fromCalendar(e: CalendarEntry, today: string): Reminder {
  let tone = TONE[e.tone];
  if (e.category === "payments") tone = e.date < today ? "bad" : e.date === today ? "warn" : "info";
  if (e.category === "events" || e.category === "leaves" || e.category === "holidays") tone = "info";
  if (e.category === "agenda" && e.item) {
    const late = !e.item.done && (e.item.endDate ?? e.item.date) < today;
    tone = late ? "bad" : e.item.kind === "payable" || e.item.kind === "delivery" ? "warn" : "info";
  }
  return {
    id: e.id,
    category: e.category,
    tone,
    ...taskFor(e, today),
    date: e.date,
    href: e.href ?? (["events", "leaves", "agenda", "holidays"].includes(e.category) ? "/calendar" : undefined),
    itemId: e.item?.id,
  };
}

/** Stock alerts are listed on their own, under the to-dos. */
export const isStockAlert = (r: Reminder) => r.category === "alerts";

const RANK: Record<ReminderTone, number> = { bad: 0, warn: 1, info: 2 };
const ORDER: Record<Reminder["category"], number> = { payments: 0, salaries: 1, followup: 2, agenda: 3, alerts: 4, events: 5, holidays: 6, leaves: 7, production: 8, shipments: 9, dayoffs: 10 };
const sortReminders = (list: Reminder[]) =>
  [...list].sort((a, b) => RANK[a.tone] - RANK[b.tone] || ORDER[a.category] - ORDER[b.category] || a.date.localeCompare(b.date));

export function buildReminders(
  calendar: CalendarEntry[],
  entries: Entry[],
  today: string,
  /** Reminders from elsewhere — salaries (lib/payroll/reminders). */
  extra: { today: Reminder[]; upcoming: Reminder[] } = { today: [], upcoming: [] },
): Reminders {
  const todays: Reminder[] = [...extra.today];
  const upcoming: Reminder[] = [...extra.upcoming];
  const horizon = addDays(today, COMING_UP_DAYS);
  // Holidays and days off are planned around, so they show through the end of next month.
  const noWorkHorizon = endOfNextMonth(today);

  for (const e of calendar) {
    // Shipments already happened; they're history, not reminders.
    if (e.category === "shipments") continue;
    if (e.category === "payments") {
      // Overdue payments stay on "today" until they're paid.
      if (e.date <= today) todays.push(fromCalendar(e, today));
      else if (e.date <= horizon) upcoming.push(fromCalendar(e, today));
      continue;
    }
    if (e.category === "agenda" && e.item) {
      // Done items drop off. A task or deadline not done stays on today until it is.
      if (e.item.done) continue;
      const lingers = e.item.kind !== "event" && e.item.kind !== "meeting";
      if (coversDay(e, today) || (lingers && (e.endDate ?? e.date) < today)) todays.push(fromCalendar(e, today));
      else if (e.date > today && e.date <= horizon) upcoming.push(fromCalendar(e, today));
      continue;
    }
    if (coversDay(e, today)) todays.push(fromCalendar(e, today));
    else if (e.date > today && e.date <= noWorkHorizon && isNoWork(e)) upcoming.push(fromCalendar(e, today));
    else if (e.date > today && e.date <= horizon && (e.category === "events" || e.category === "dayoffs" || e.category === "alerts" || e.category === "leaves" || e.category === "holidays")) upcoming.push(fromCalendar(e, today));
  }

  // Money a customer owes with no due date set: nudge once it has waited two weeks.
  for (const e of entries) {
    if (termOf(e) !== "receivable" || e.dueDate) continue;
    const owed = outstanding(e);
    if (owed <= 0) continue;
    const waited = daysBetween(dayOf(e.timestamp), today);
    if (waited < FOLLOW_UP_AFTER_DAYS) continue;
    todays.push({
      id: `followup:${e.id}`,
      category: "followup",
      tone: "warn",
      title: `Ask ${e.counterparty || "the customer"} to pay ${peso(owed)}`,
      detail: `Waiting ${waited} days`,
      date: dayOf(e.timestamp),
      href: "/transactions",
    });
  }

  const sortedToday = sortReminders(todays);
  return {
    today: sortedToday,
    upcoming: sortReminders(upcoming).sort((a, b) => a.date.localeCompare(b.date)),
    urgentCount: sortedToday.filter((r) => r.tone !== "info").length,
  };
}
