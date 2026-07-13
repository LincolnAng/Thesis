import { formatPeso } from "@/lib/format";
import { isWithinDays, totalExpenses, totalRevenue } from "@/lib/store/derive";
import type { StoreState } from "@/lib/store/store";

export function computeInsight(state: StoreState): string | null {
  const thisMonth = state.entries.filter((e) => isWithinDays(e.timestamp, 30));
  const revenue = totalRevenue(thisMonth);
  const expenses = totalExpenses(thisMonth);
  const profit = revenue - expenses;

  if (revenue === 0 && expenses === 0) return null;

  if (profit >= 0) {
    return `You've made ${formatPeso(profit)} profit this month.`;
  }
  return `Heads up — expenses are ${formatPeso(Math.abs(profit))} more than sales this month.`;
}
