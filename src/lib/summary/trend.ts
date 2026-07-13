import type { Entry, EntryType } from "@/lib/store/types";
import { entriesInMonth, sum } from "./period";

export interface TrendPoint {
  label: string;
  value: number;
}

/** Monthly totals for the given entry type, oldest to newest, ending this month. */
export function monthlyTrend(entries: Entry[], type: EntryType, months = 6, now: Date = new Date()): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthEntries = entriesInMonth(entries, i, now).filter((e) => e.type === type);
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    points.push({ label: d.toLocaleDateString("en-PH", { month: "short" }), value: sum(monthEntries, (e) => e.amount ?? 0) });
  }
  return points;
}
