import { formatPeso, pluralize } from "@/lib/format";
import { isWithinDays, totalExpenses, totalRevenue } from "@/lib/store/derive";
import type { StoreState } from "@/lib/store/store";

function includesAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

export function localAnswer(message: string, state: StoreState): string {
  const text = message.toLowerCase();

  if (includesAny(text, ["how much did i make", "revenue", "sales this week", "kinita", "magkano"])) {
    const week = totalRevenue(state.entries.filter((e) => isWithinDays(e.timestamp, 7)));
    const month = totalRevenue(state.entries.filter((e) => isWithinDays(e.timestamp, 30)));
    return `You made ${formatPeso(week)} this week and ${formatPeso(month)} this month. See the Sales tab for more.`;
  }

  if (includesAny(text, ["expense", "spend", "gastos", "kuryente"])) {
    const month = totalExpenses(state.entries.filter((e) => isWithinDays(e.timestamp, 30)));
    return `You've spent ${formatPeso(month)} this month. See the Expenses tab for a breakdown.`;
  }

  if (includesAny(text, ["stock", "enough", "cocoa beans", "imbentaryo", "paubos"])) {
    const low = state.products.filter((p) => p.stockQty <= p.lowStockThreshold);
    if (low.length) {
      return `${low.map((p) => `${p.name} is running low, ${pluralize(p.stockQty, "jar")} left`).join(". ")}. See the Inventory tab.`;
    }
    return "Your stock looks fine right now. See the Inventory tab for details.";
  }

  if (includesAny(text, ["best seller", "top seller", "bestseller"])) {
    return "Check the Sales tab — it shows your best sellers for the month.";
  }

  return "I can't reach the AI right now, so my answers are limited. You can still log sales and expenses — I'll fill in a quick form for you to check. Your numbers are always on the Home tab.";
}
