import { PRICE_TYPE_LABELS } from "@/lib/format";
import { chipColor } from "@/lib/chart-colors";
import type { Entry, Product } from "@/lib/store/types";
import { productCostPerJar, type CostContext } from "./recipe-cost";
import { findProduct } from "./product-match";
import { entriesInMonth, pctChange, sortByDateDesc, sum } from "./period";
import { monthlyTrend, type TrendPoint } from "./trend";

export interface BestSellerRow {
  sku: string;
  revenue: number;
  qty: number;
  barPct: number;
  color: string;
}

export interface PriceTypeRow {
  key: string;
  label: string;
  qty: number;
  revenue: number;
  color: string;
}

export interface SalesSummary {
  revenue: number;
  revenueChangePct: number | null;
  jarsSold: number;
  jarsChangePct: number | null;
  /** Number of sales, as distinct from jars — five jars in one order is one order. */
  orderCount: number;
  orderCountChangePct: number | null;
  avgOrderValue: number;
  avgPerJar: number;
  /** Cost of goods as a share of revenue. The other half of gross margin, stated directly. */
  cogsPct: number;
  profit: number;
  grossMarginPct: number;
  bestSellers: BestSellerRow[];
  byPriceType: PriceTypeRow[];
  recent: Entry[];
  trend: TrendPoint[];
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

/** Same product = same color everywhere in Summary (Sales best sellers, Stock jars on hand). */
export function productColor(products: Product[], sku: string | null): string {
  if (!sku) return chipColor(products.length);
  const index = products.findIndex((p) => normalize(p.name) === normalize(sku));
  return chipColor(index >= 0 ? index : products.length);
}

export function computeSalesSummary(entries: Entry[], products: Product[], ctx: CostContext): SalesSummary {
  const thisMonth = entriesInMonth(entries, 0).filter((e) => e.type === "SALE");
  const lastMonth = entriesInMonth(entries, 1).filter((e) => e.type === "SALE");

  const revenue = sum(thisMonth, (e) => e.amount ?? 0);
  const lastRevenue = sum(lastMonth, (e) => e.amount ?? 0);
  const jarsSold = sum(thisMonth, (e) => e.quantity ?? 0);
  const lastJarsSold = sum(lastMonth, (e) => e.quantity ?? 0);
  const avgPerJar = jarsSold > 0 ? revenue / jarsSold : 0;
  const orderCount = thisMonth.length;
  const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0;

  let profit = 0;
  for (const e of thisMonth) {
    const product = findProduct(products, e.sku);
    if (product && e.quantity) {
      const cost = productCostPerJar(product, ctx).costPerJar * e.quantity;
      profit += (e.amount ?? 0) - cost;
    }
  }

  const bySku = new Map<string, { revenue: number; qty: number }>();
  for (const e of thisMonth) {
    const key = e.sku ?? "Other";
    const current = bySku.get(key) ?? { revenue: 0, qty: 0 };
    current.revenue += e.amount ?? 0;
    current.qty += e.quantity ?? 0;
    bySku.set(key, current);
  }
  const sortedSkus = Array.from(bySku.entries()).sort((a, b) => b[1].revenue - a[1].revenue);
  const maxRevenue = sortedSkus[0]?.[1].revenue ?? 0;
  const bestSellers: BestSellerRow[] = sortedSkus.slice(0, 3).map(([sku, v]) => ({
    sku,
    revenue: v.revenue,
    qty: v.qty,
    barPct: maxRevenue > 0 ? (v.revenue / maxRevenue) * 100 : 0,
    color: productColor(products, sku),
  }));

  const priceTypeKeys = ["standard", "wholesale", "friend"];
  const byPriceType: PriceTypeRow[] = priceTypeKeys
    .map((key, i) => {
      const matching = thisMonth.filter((e) => (e.priceType ?? "standard") === key);
      return {
        key,
        label: PRICE_TYPE_LABELS[key] ?? key,
        qty: sum(matching, (e) => e.quantity ?? 0),
        revenue: sum(matching, (e) => e.amount ?? 0),
        color: chipColor(i),
      };
    })
    .filter((row) => row.qty > 0 || row.revenue > 0);

  const recent = sortByDateDesc(thisMonth).slice(0, 3);
  const trend = monthlyTrend(entries, "SALE");

  return {
    revenue,
    revenueChangePct: pctChange(revenue, lastRevenue),
    jarsSold,
    jarsChangePct: pctChange(jarsSold, lastJarsSold),
    orderCount,
    orderCountChangePct: pctChange(orderCount, lastMonth.length),
    avgOrderValue,
    avgPerJar,
    cogsPct: revenue > 0 ? ((revenue - profit) / revenue) * 100 : 0,
    profit,
    grossMarginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    bestSellers,
    byPriceType,
    recent,
    trend,
  };
}
