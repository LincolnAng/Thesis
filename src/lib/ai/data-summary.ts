import { formatPeso, pluralize } from "@/lib/format";
import {
  expensesByCategory,
  isWithinDays,
  revenueBySku,
  totalExpenses,
  totalRevenue,
  totalWasteValue,
} from "@/lib/store/derive";
import { deriveCustomers } from "@/lib/summary/customers";
import { productCostPerJar } from "@/lib/summary/recipe-cost";
import { hourlyLaborRateFrom } from "@/lib/summary/use-cost-context";
import { cacaoUtilizationPct } from "@/lib/summary/business-config";
import { findProduct } from "@/lib/summary/product-match";
import type { StoreState } from "@/lib/store/store";

/**
 * The figures the assistant is allowed to answer from.
 *
 * It used to see only raw totals, so a question about margins or customers got generic
 * advice instead of the owner's own numbers. Anything the app can compute and display
 * belongs here — an answer that cites a real figure is the whole point, and a model with
 * no figure to cite will reach for a plausible-sounding one.
 */
export function buildDataSummary(state: StoreState): string {
  const thisWeek = state.entries.filter((e) => isWithinDays(e.timestamp, 7));
  const thisMonth = state.entries.filter((e) => isWithinDays(e.timestamp, 30));
  const salesThisMonth = thisMonth.filter((e) => e.type === "SALE");

  const revenueWeek = totalRevenue(thisWeek);
  const revenueMonth = totalRevenue(thisMonth);
  const expensesMonth = totalExpenses(thisMonth);
  const wasteMonth = totalWasteValue(thisMonth);
  const topSkus = revenueBySku(thisMonth).slice(0, 3);
  const catSpend = expensesByCategory(thisMonth);
  const lowStock = state.products.filter((p) => p.stockQty <= p.lowStockThreshold);
  const lowRaw = state.rawMaterials.filter((m) => m.qty <= m.lowStockThreshold);

  const costCtx = {
    rawMaterials: state.rawMaterials,
    supplierPrices: state.supplierPrices,
    hourlyLaborRate: hourlyLaborRateFrom(state.businessSettings),
    cacaoUtilization: cacaoUtilizationPct(state.businessSettings) / 100,
  };

  // Cost of goods for the month, so margin can be stated rather than guessed at.
  let cogsMonth = 0;
  for (const sale of salesThisMonth) {
    const product = findProduct(state.products, sale.sku);
    if (product && sale.quantity) cogsMonth += productCostPerJar(product, costCtx).costPerJar * sale.quantity;
  }
  const grossMargin = revenueMonth > 0 ? ((revenueMonth - cogsMonth) / revenueMonth) * 100 : 0;

  const customers = deriveCustomers(state.entries);
  const topCustomer = customers[0];

  const priceMoves = state.suppliers
    .filter((s) => s.priceHistory.length >= 2)
    .map((s) => {
      const latest = s.priceHistory[s.priceHistory.length - 1];
      const previous = s.priceHistory[s.priceHistory.length - 2];
      const direction = latest.price > previous.price ? "up" : latest.price < previous.price ? "down" : "flat";
      return `${s.name} ${direction} from ${formatPeso(previous.price)} to ${formatPeso(latest.price)}`;
    });

  const productCosts = state.products.map((p) => {
    const cost = productCostPerJar(p, costCtx);
    return `${p.name}: costs ${formatPeso(cost.costPerJar)}/jar (ingredients ${formatPeso(
      cost.ingredientPerJar,
    )}, packaging ${formatPeso(cost.packagingPerJar)}, labor ${formatPeso(cost.laborPerJar)}, other ${formatPeso(
      cost.miscPerJar,
    )}), sells at ${formatPeso(p.standardPrice)}`;
  });

  const lines = [
    `Revenue this week: ${formatPeso(revenueWeek)}`,
    `Revenue this month: ${formatPeso(revenueMonth)} across ${pluralize(salesThisMonth.length, "sale")}`,
    `Expenses this month: ${formatPeso(expensesMonth)}`,
    `Cost of goods sold this month: ${formatPeso(cogsMonth)}`,
    `Net profit this month: ${formatPeso(revenueMonth - cogsMonth - expensesMonth)}`,
    `Gross margin this month: ${Math.round(grossMargin)}%`,
    `Waste value this month: ${formatPeso(wasteMonth)}`,
    `Top-selling SKUs this month: ${topSkus.map((s) => `${s.sku} (${formatPeso(s.revenue)})`).join(", ") || "none"}`,
    `Expense breakdown this month: ${
      Object.entries(catSpend)
        .map(([k, v]) => `${k}=${formatPeso(v)}`)
        .join(", ") || "none"
    }`,
    `Per-product costs and prices: ${productCosts.join(" | ") || "none"}`,
    `Product stock: ${state.products.map((p) => `${p.name}=${p.stockQty}`).join(", ")}`,
    `Low stock finished products: ${lowStock.map((p) => p.name).join(", ") || "none"}`,
    `Low stock raw materials: ${lowRaw.map((m) => `${m.name} (${m.qty} ${m.unit} left)`).join(", ") || "none"}`,
    `Customers tracked: ${customers.length}${
      topCustomer ? `, top is ${topCustomer.name} at ${formatPeso(topCustomer.totalSpent)} over ${pluralize(topCustomer.orderCount, "order")}` : ""
    }`,
    `Recent supplier price changes: ${priceMoves.join("; ") || "none"}`,
    `Total entries logged: ${state.entries.length}`,
  ];
  return lines.join("\n");
}
