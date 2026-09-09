import type { Entry, Event } from "@/lib/store/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Activity "during" an event: explicitly tagged entries (Entry.eventId), plus — since most
 * entries logged during a real event won't have been manually tagged — anything else that
 * simply happened within the event's date range. This is a filter dimension over the existing
 * entries list, not a separate tracked total, so it's always exactly as accurate as the
 * entries themselves. */
export function entriesForEvent(event: Event, entries: Entry[]): Entry[] {
  const start = new Date(event.startDate).getTime();
  const end = new Date(event.endDate).getTime() + DAY_MS - 1; // inclusive through the end date
  return entries
    .filter((e) => {
      if (e.eventId === event.id) return true;
      const t = new Date(e.timestamp).getTime();
      return t >= start && t <= end;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export interface EventStats {
  entryCount: number;
  revenue: number;
}

export function eventStats(event: Event, entries: Entry[]): EventStats {
  const scoped = entriesForEvent(event, entries);
  const revenue = scoped.filter((e) => e.type === "SALE").reduce((sum, e) => sum + (e.amount ?? 0), 0);
  return { entryCount: scoped.length, revenue };
}

export function isEventActive(event: Event, now: Date = new Date()): boolean {
  const start = new Date(event.startDate).getTime();
  const end = new Date(event.endDate).getTime() + DAY_MS - 1;
  const t = now.getTime();
  return t >= start && t <= end;
}
