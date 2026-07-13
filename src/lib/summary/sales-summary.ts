import { PRICE_TYPE_LABELS } from "@/lib/format";
import { chipColor } from "@/lib/chart-colors";
import type { Entry, Product, RawMaterialStock } from "@/lib/store/types";
import { productCostPerJar } from "./recipe-cost";
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
  avgPerJar: number;
  profit: number;
  bestSellers: BestSellerRow[];
  byPriceType: PriceTypeRow[];
  recent: Entry[];
  trend: TrendPoint[];
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

function findProduct(products: Product[], sku: string | null): Product | undefined {
  if (!sku) return undefined;
  const n = normalize(sku);
  return (
    products.find((p) => normalize(p.name) === n) ??
    products.find((p) => normalize(p.name).includes(n) || n.includes(normalize(p.name)))
  );
}

/** Same product = same color everywhere in Summary (Sales best sellers, Stock jars on hand). */
export function productColor(products: Product[], sku: string | null): string {
  if (!sku) return chipColor(products.length);
  const index = products.findIndex((p) => normalize(p.name) === normalize(sku));
  return chipColor(index >= 0 ? index : products.length);
}

export function computeSalesSummary(entries: Entry[], products: Product[], rawMaterials: RawMaterialStock[]): SalesSummary {
  const thisMonth = entriesInMonth(entries, 0).filter((e) => e.type === "SALE");
  const lastMonth = entriesInMonth(entries, 1).filter((e) => e.type === "SALE");

  const revenue = sum(thisMonth, (e) => e.amount ?? 0);
  const lastRevenue = sum(lastMonth, (e) => e.amount ?? 0);
  const jarsSold = sum(thisMonth, (e) => e.quantity ?? 0);
  const avgPerJar = jarsSold > 0 ? revenue / jarsSold : 0;

  let profit = 0;
  for (const e of thisMonth) {
    const product = findProduct(products, e.sku);
    if (product && e.quantity) {
      const cost = productCostPerJar(product, rawMaterials).costPerJar * e.quantity;
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
    avgPerJar,
    profit,
    bestSellers,
    byPriceType,
    recent,
    trend,
  };
}
