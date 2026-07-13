import type { Entry } from "@/lib/store/types";
import type { MonthlyTrendPoint } from "@/components/summary/monthly-trend-chart";
import { entriesInMonth, sum } from "./period";

/** Monthly units produced (value) vs units sold (secondaryValue), oldest to newest, ending this month. */
export function stockMonthlyTrend(entries: Entry[], months = 6, now: Date = new Date()): MonthlyTrendPoint[] {
  const points: MonthlyTrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthEntries = entriesInMonth(entries, i, now);
    const produced = sum(
      monthEntries.filter((e) => e.type === "INVENTORY_IN"),
      (e) => e.quantity ?? 0,
    );
    const sold = sum(
      monthEntries.filter((e) => e.type === "SALE"),
      (e) => e.quantity ?? 0,
    );
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    points.push({ label: d.toLocaleDateString("en-PH", { month: "short" }), value: produced, secondaryValue: sold });
  }
  return points;
}
