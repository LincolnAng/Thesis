import { formatPeso } from "@/lib/format";
import {
  expensesByCategory,
  isWithinDays,
  revenueBySku,
  totalExpenses,
  totalRevenue,
  totalWasteValue,
} from "@/lib/store/derive";
import type { StoreState } from "@/lib/store/store";

export function buildDataSummary(state: StoreState): string {
  const thisWeek = state.entries.filter((e) => isWithinDays(e.timestamp, 7));
  const thisMonth = state.entries.filter((e) => isWithinDays(e.timestamp, 30));

  const revenueWeek = totalRevenue(thisWeek);
  const revenueMonth = totalRevenue(thisMonth);
  const expensesMonth = totalExpenses(thisMonth);
  const wasteMonth = totalWasteValue(thisMonth);
  const topSkus = revenueBySku(thisMonth).slice(0, 3);
  const catSpend = expensesByCategory(thisMonth);
  const lowStock = state.products.filter((p) => p.stockQty <= p.lowStockThreshold);
  const lowRaw = state.rawMaterials.filter((m) => m.qty <= m.lowStockThreshold);

  const lines = [
    `Revenue this week: ${formatPeso(revenueWeek)}`,
    `Revenue this month: ${formatPeso(revenueMonth)}`,
    `Expenses this month: ${formatPeso(expensesMonth)}`,
    `Profit this month (rough): ${formatPeso(revenueMonth - expensesMonth)}`,
    `Waste value this month: ${formatPeso(wasteMonth)}`,
    `Top-selling SKUs this month: ${topSkus.map((s) => `${s.sku} (${formatPeso(s.revenue)})`).join(", ") || "none"}`,
    `Expense breakdown this month: ${Object.entries(catSpend)
      .map(([k, v]) => `${k}=${formatPeso(v)}`)
      .join(", ") || "none"}`,
    `Product stock: ${state.products.map((p) => `${p.name}=${p.stockQty}`).join(", ")}`,
    `Low stock finished products: ${lowStock.map((p) => p.name).join(", ") || "none"}`,
    `Low stock raw materials: ${lowRaw.map((m) => m.name).join(", ") || "none"}`,
    `Total entries logged: ${state.entries.length}`,
  ];
  return lines.join("\n");
}
