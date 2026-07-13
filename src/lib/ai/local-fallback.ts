import { formatPeso } from "@/lib/format";
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
    return `You made ${formatPeso(week)} this week and ${formatPeso(month)} this month. See the Summary tab for more.`;
  }

  if (includesAny(text, ["expense", "spend", "gastos", "kuryente"])) {
    const month = totalExpenses(state.entries.filter((e) => isWithinDays(e.timestamp, 30)));
    return `You've spent ${formatPeso(month)} this month. See the Summary tab for a breakdown.`;
  }

  if (includesAny(text, ["stock", "enough", "cocoa beans", "imbentaryo", "paubos"])) {
    const low = state.products.filter((p) => p.stockQty <= p.lowStockThreshold);
    if (low.length) {
      return `${low.map((p) => `${p.name} is running low, ${p.stockQty} jars left`).join(". ")}. See the Stock section in Summary.`;
    }
    return "Your stock looks fine right now. See the Stock section in Summary for details.";
  }

  if (includesAny(text, ["best seller", "top seller", "bestseller"])) {
    return "Check the Sales section in Summary — it shows your best sellers for the month.";
  }

  return "I can't reach the AI right now, so my answers are limited. You can still log sales and expenses — I'll fill in a quick form for you to check. Numbers are always available under Summary.";
}
