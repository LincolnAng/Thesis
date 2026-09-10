"use client";

import { useMemo } from "react";
import { Box, Calculator, Home, Receipt, Truck, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SummaryGrid, type GridItem } from "@/components/summary/summary-grid";
import { Bar } from "@/components/summary/bar";
import { StatTile } from "@/components/data-table/stat-tile";
import { ProfitWaterfall } from "@/components/summary/profit-waterfall";
import { NetProfitChart } from "@/components/summary/net-profit-chart";
import { CogsPercentChart } from "@/components/summary/cogs-percent-chart";
import { ExpensesCategoryChart } from "@/components/summary/expenses-category-chart";
import { ProfitableProductsList } from "@/components/summary/profitable-products-list";
import { SupplierPriceSummaryChart } from "@/components/summary/supplier-price-summary-chart";
import { useStore } from "@/lib/store/use-store";
import { currentMonthLabel, formatPeso, pluralize } from "@/lib/format";
import { computeSalesSummary } from "@/lib/summary/sales-summary";
import { computeExpensesSummary, monthlyExpensesByCategory } from "@/lib/summary/expenses-summary";
import { computeIngredientReach } from "@/lib/summary/ingredient-reach";
import { computeMonthlyProfitTrend, computeProductMarginRanking } from "@/lib/summary/profit-summary";
import { productCostPerJar } from "@/lib/summary/recipe-cost";
import { useViewMode } from "@/lib/summary/view-mode";
import { useCostContext } from "@/lib/summary/use-cost-context";

export default function HomePage() {
  const { entries, products, rawMaterials, suppliers, categoryBudgets } = useStore();
  const [viewMode] = useViewMode();
  const costCtx = useCostContext();

  const sales = useMemo(
    () => computeSalesSummary(entries, products, costCtx),
    [entries, products, costCtx],
  );
  const expenses = useMemo(() => computeExpensesSummary(entries, categoryBudgets), [entries, categoryBudgets]);
  const profitTrend = useMemo(
    () => computeMonthlyProfitTrend(entries, products, costCtx),
    [entries, products, costCtx],
  );
  const marginRanking = useMemo(
    () => computeProductMarginRanking(entries, products, costCtx),
    [entries, products, costCtx],
  );
  const expensesByCategory = useMemo(() => monthlyExpensesByCategory(entries), [entries]);
  const profitThisMonth = profitTrend[profitTrend.length - 1];
  const reaches = useMemo(
    () => computeIngredientReach(rawMaterials, products, entries),
    [rawMaterials, products, entries],
  );

  const mostUrgentReach = reaches
    .filter((r) => r.daysLeft !== null)
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity))[0];
  const stockStat = mostUrgentReach
    ? `${mostUrgentReach.material.name}: ${pluralize(mostUrgentReach.daysLeft ?? 0, "day")} left`
    : "Stock looks good";

  const avgCostPerJar =
    products.length > 0
      ? products.reduce((sum, p) => sum + productCostPerJar(p, costCtx).costPerJar, 0) / products.length
      : 0;

  const priceRoseCount = suppliers.filter((s) => {
    const h = s.priceHistory;
    return h.length >= 2 && h[h.length - 1].price > h[h.length - 2].price;
  }).length;

  const netProfit = profitThisMonth?.netProfit ?? 0;
  const cogsPct = profitThisMonth?.cogsPct ?? 0;
  const expensesPct = sales.revenue > 0 ? (expenses.total / sales.revenue) * 100 : 0;

  const items: GridItem[] = [
    { key: "sales", label: "Sales", icon: Receipt, stat: `${formatPeso(sales.revenue)} this month`, href: "/sales" },
    {
      key: "expenses",
      label: "Expenses",
      icon: Wallet,
      stat: `${formatPeso(expenses.total)} this month`,
      href: "/expenses",
    },
    {
      key: "stock",
      label: "Inventory",
      icon: Box,
      stat: stockStat,
      statTone: mostUrgentReach && mostUrgentReach.urgency === "red" ? "warning" : "neutral",
      href: "/inventory",
    },
    {
      key: "pricing",
      label: "Pricing Calculator",
      icon: Calculator,
      stat: `${formatPeso(avgCostPerJar)} avg cost/jar`,
      href: "/pricing",
    },
    {
      key: "suppliers",
      label: "Suppliers",
      icon: Truck,
      stat:
        priceRoseCount > 0
          ? `${suppliers.length} suppliers · ${priceRoseCount} price rose`
          : `${suppliers.length} suppliers`,
      statTone: priceRoseCount > 0 ? "warning" : "neutral",
      href: "/suppliers",
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader icon={Home} title="Home" meta={currentMonthLabel()} />
      {viewMode === "advanced" && (
        <>
          <ProfitWaterfall
            revenue={sales.revenue}
            cogs={profitThisMonth?.cogs ?? 0}
            expenses={expenses.total}
            netProfit={netProfit}
            periodLabel={currentMonthLabel()}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Gross margin" value={`${Math.round(sales.grossMarginPct)}%`} sub="this month" />
          </div>

          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Financial health</h2>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">Ingredient cost (COGS)</span>
                <span className="text-muted-foreground">{Math.round(cogsPct)}% of revenue</span>
              </div>
              <Bar pct={cogsPct} tone="warning" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">Other expenses</span>
                <span className="text-muted-foreground">{Math.round(expensesPct)}% of revenue</span>
              </div>
              <Bar pct={expensesPct} tone="warning" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <NetProfitChart data={profitTrend} />
            <CogsPercentChart data={profitTrend} />
            <ExpensesCategoryChart data={expensesByCategory} />
            <SupplierPriceSummaryChart suppliers={suppliers} />
            <ProfitableProductsList rows={marginRanking} />
          </div>
        </>
      )}

      <div>
        <SummaryGrid items={items} />
      </div>
    </div>
  );
}
