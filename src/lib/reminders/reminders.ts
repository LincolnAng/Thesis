import type { CalendarCategory, CalendarEntry } from "@/lib/calendar/entries";
import { coversDay } from "@/lib/calendar/entries";
import { dayOf, outstanding, termOf } from "@/lib/transactions/ledger";
import type { Entry } from "@/lib/store/types";

/**
 * What's up today — the bell on every page and the big card on Home. Built from the Calendar's
 * own entries (lib/calendar/entries), so the two always agree, plus what a calendar can't put on
 * a single day:
 *
 *   overdue    a payment past its due date stays here every day until it's paid, not only on
 *              the day it fell due;
 *   follow-up  money a customer owes with no due date, once it has been waiting two weeks.
 *
 * "Today" is everything that needs doing now; "Coming up" is the next few days' payments and
 * events, so nothing due tomorrow is a surprise. Pure — no store, no React.
 */

export type ReminderTone = "bad" | "warn" | "info";

export interface Reminder {
  id: string;
  category: CalendarCategory | "followup";
  tone: ReminderTone;
  title: string;
  detail?: string;
  /** "YYYY-MM-DD" it's about — the due date, the event day. */
  date: string;
  href?: string;
}

export interface Reminders {
  today: Reminder[];
  upcoming: Reminder[];
  /** Today's items that need action (not just information) — the bell's count. */
  urgentCount: number;
}

export const COMING_UP_DAYS = 3;
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

function fromCalendar(e: CalendarEntry, today: string): Reminder {
  let title = e.title;
  let tone = TONE[e.tone];
  if (e.category === "payments") {
    const late = e.date < today;
    title = `${e.title} ${e.subtitle ?? ""}`.trim();
    tone = late ? "bad" : e.date === today ? "warn" : "info";
    return { id: e.id, category: e.category, tone, title, detail: late ? undefined : e.date === today ? "Due today" : undefined, date: e.date, href: e.href };
  }
  if (e.category === "events") tone = "info";
  return { id: e.id, category: e.category, tone, title, detail: e.subtitle, date: e.date, href: e.href ?? (e.category === "events" ? "/calendar" : undefined) };
}

const RANK: Record<ReminderTone, number> = { bad: 0, warn: 1, info: 2 };
const ORDER: Record<Reminder["category"], number> = { payments: 0, followup: 1, alerts: 2, events: 3, production: 4, shipments: 5, dayoffs: 6 };
const sortReminders = (list: Reminder[]) =>
  [...list].sort((a, b) => RANK[a.tone] - RANK[b.tone] || ORDER[a.category] - ORDER[b.category] || a.date.localeCompare(b.date));

export function buildReminders(calendar: CalendarEntry[], entries: Entry[], today: string): Reminders {
  const todays: Reminder[] = [];
  const upcoming: Reminder[] = [];
  const horizon = addDays(today, COMING_UP_DAYS);

  for (const e of calendar) {
    // Shipments already happened; they're history, not reminders.
    if (e.category === "shipments") continue;
    if (e.category === "payments") {
      // Overdue payments stay on "today" until they're paid.
      if (e.date <= today) todays.push(fromCalendar(e, today));
      else if (e.date <= horizon) upcoming.push(fromCalendar(e, today));
      continue;
    }
    if (coversDay(e, today)) todays.push(fromCalendar(e, today));
    else if (e.date > today && e.date <= horizon && (e.category === "events" || e.category === "dayoffs" || e.category === "alerts")) upcoming.push(fromCalendar(e, today));
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
      title: `Follow up: ${e.counterparty || "a customer"} owes ${peso(owed)}`,
      detail: `${waited} days since the sale${e.sku ? ` · ${e.sku}` : ""} · no due date set`,
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
