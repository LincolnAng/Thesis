import type { Entry } from "@/lib/store/types";

export function monthBounds(offsetMonths: number, now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth() - offsetMonths, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - offsetMonths + 1, 1);
  return { start, end };
}

export function entriesInMonth(entries: Entry[], offsetMonths: number, now: Date = new Date()): Entry[] {
  const { start, end } = monthBounds(offsetMonths, now);
  return entries.filter((e) => {
    const t = new Date(e.timestamp);
    return t >= start && t < end;
  });
}

/** Percent change from previous to current. Null when there's nothing to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : null;
  return ((current - previous) / previous) * 100;
}

export function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

export function sortByDateDesc(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
