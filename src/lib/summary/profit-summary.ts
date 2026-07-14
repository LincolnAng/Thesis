import type { Entry, Product, RawMaterialStock } from "@/lib/store/types";
import { productCostPerJar } from "./recipe-cost";
import { entriesInMonth, sum } from "./period";
import { findProduct } from "./sales-summary";

export interface ProfitPoint {
  label: string;
  revenue: number;
  cogs: number;
  expenses: number;
  netProfit: number;
  cogsPct: number; // cost of goods sold as % of revenue — 0 when there's no revenue
}

/**
 * Revenue, cost of goods sold, other expenses, and the resulting bottom line —
 * oldest to newest, ending this month. This is the true net profit: sales-summary's
 * "profit" only ever subtracted ingredient cost, never the rest of the business's
 * logged expenses (labor, utilities, packaging, transport, misc).
 */
export function computeMonthlyProfitTrend(
  entries: Entry[],
  products: Product[],
  rawMaterials: RawMaterialStock[],
  months = 6,
  now: Date = new Date(),
): ProfitPoint[] {
  const points: ProfitPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthEntries = entriesInMonth(entries, i, now);
    const sales = monthEntries.filter((e) => e.type === "SALE");
    const expenseEntries = monthEntries.filter((e) => e.type === "EXPENSE");

    const revenue = sum(sales, (e) => e.amount ?? 0);
    let cogs = 0;
    for (const e of sales) {
      const product = findProduct(products, e.sku);
      if (product && e.quantity) {
        cogs += productCostPerJar(product, rawMaterials).costPerJar * e.quantity;
      }
    }
    const expenses = sum(expenseEntries, (e) => e.amount ?? 0);

    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    points.push({
      label: d.toLocaleDateString("en-PH", { month: "short" }),
      revenue,
      cogs,
      expenses,
      netProfit: revenue - cogs - expenses,
      cogsPct: revenue > 0 ? (cogs / revenue) * 100 : 0,
    });
  }
  return points;
}

export interface ProductMarginRow {
  sku: string;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  qty: number;
}

/**
 * This month's products ranked by how much profit they actually contributed — a
 * bestseller by revenue can still be a poor earner if its margin is thin.
 */
export function computeProductMarginRanking(
  entries: Entry[],
  products: Product[],
  rawMaterials: RawMaterialStock[],
  now: Date = new Date(),
): ProductMarginRow[] {
  const thisMonth = entriesInMonth(entries, 0, now).filter((e) => e.type === "SALE");
  const bySku = new Map<string, { revenue: number; cost: number; qty: number }>();
  for (const e of thisMonth) {
    const key = e.sku ?? "Other";
    const product = findProduct(products, e.sku);
    const qty = e.quantity ?? 0;
    const cost = product ? productCostPerJar(product, rawMaterials).costPerJar * qty : 0;
    const current = bySku.get(key) ?? { revenue: 0, cost: 0, qty: 0 };
    current.revenue += e.amount ?? 0;
    current.cost += cost;
    current.qty += qty;
    bySku.set(key, current);
  }
  return Array.from(bySku.entries())
    .map(([sku, v]) => ({
      sku,
      revenue: v.revenue,
      cost: v.cost,
      margin: v.revenue - v.cost,
      marginPct: v.revenue > 0 ? ((v.revenue - v.cost) / v.revenue) * 100 : 0,
      qty: v.qty,
    }))
    .sort((a, b) => b.margin - a.margin);
}
