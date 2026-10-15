"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartGrid } from "@/components/layout/containers";
import { ProfitWaterfall } from "@/components/summary/profit-waterfall";
import { ProfitOverlayChart } from "@/components/summary/profit-overlay-chart";
import { CogsPercentChart } from "@/components/summary/cogs-percent-chart";
import { ExpensesCategoryChart } from "@/components/summary/expenses-category-chart";
import { ProfitableProductsList } from "@/components/summary/profitable-products-list";
import { SupplierPriceSummaryChart } from "@/components/summary/supplier-price-summary-chart";
import { CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_HEIGHT, CHART_LEGEND_STYLE, ChartTooltip } from "@/components/summary/chart-theme";
import { useStore } from "@/lib/store/use-store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { EXPENSE_CATEGORY_LABELS, currentMonthLabel, formatPeso, formatPesoAbbrev } from "@/lib/format";
import { computeMonthlyProfitTrend, computeProductMarginRanking } from "@/lib/summary/profit-summary";
import { expenseCategoryColor, monthlyExpensesByCategory } from "@/lib/summary/expenses-summary";
import { productColor } from "@/lib/summary/sales-summary";
import { findProduct } from "@/lib/summary/product-match";

/**
 * Every chart Home has, behind the Advanced button. The default Home is figures and
 * sentences; this is for whoever wants to see how the months compare. Each chart says what
 * period it covers and whether it shows value, units, expenses or profit.
 */
export function AdvancedAnalytics() {
  const { entries, products, suppliers } = useStore();
  const costCtx = useCostContext();

  const profitTrend = useMemo(() => computeMonthlyProfitTrend(entries, products, costCtx), [entries, products, costCtx]);
  const expensesByCategory = useMemo(() => monthlyExpensesByCategory(entries), [entries]);
  const marginRanking = useMemo(() => computeProductMarginRanking(entries, products, costCtx), [entries, products, costCtx]);
  const thisMonth = profitTrend[profitTrend.length - 1];

  return (
    <section className="space-y-5" aria-labelledby="advanced-title">
      <h2 id="advanced-title" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Advanced analytics
      </h2>

      <MonthlyFinance profitTrend={profitTrend} expensesByCategory={expensesByCategory} />
      <ProductShare />

      {thisMonth && (
        <ProfitWaterfall
          revenue={thisMonth.revenue}
          cogs={thisMonth.cogs}
          expenses={thisMonth.expenses}
          netProfit={thisMonth.netProfit}
          periodLabel={currentMonthLabel()}
        />
      )}
      <ProfitOverlayChart data={profitTrend} />
      <ChartGrid>
        <CogsPercentChart data={profitTrend} />
        <ExpensesCategoryChart data={expensesByCategory} />
        <SupplierPriceSummaryChart suppliers={suppliers} />
        <ProfitableProductsList rows={marginRanking} />
      </ChartGrid>
    </section>
  );
}

/** Sales beside expenses (stacked by category), month by month. Net income is calculated, not
 * added to either bar, so it gets its own row of figures underneath. */
function MonthlyFinance({
  profitTrend,
  expensesByCategory,
}: {
  profitTrend: ReturnType<typeof computeMonthlyProfitTrend>;
  expensesByCategory: ReturnType<typeof monthlyExpensesByCategory>;
}) {
  const categories = Array.from(new Set(expensesByCategory.flatMap((p) => Object.keys(p.byCategory))));
  const labelFor = (c: string) => EXPENSE_CATEGORY_LABELS[c] ?? c;
  const data = profitTrend.map((point, i) => {
    const row: Record<string, string | number> = { label: point.label, Sales: point.revenue };
    for (const c of categories) row[labelFor(c)] = expensesByCategory[i]?.byCategory[c] ?? 0;
    return row;
  });

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">Sales and expenses by month</h3>
        <p className="text-xs text-muted-foreground">Last 6 months · peso value · expenses stacked by category</p>
      </div>
      <div style={{ height: CHART_HEIGHT + 40 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
            <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={{ stroke: CHART_GRID_STROKE }} tickLine={false} />
            <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => formatPesoAbbrev(v)} />
            <Tooltip content={<ChartTooltip formatValue={(v) => formatPesoAbbrev(Number(v))} />} />
            <Legend wrapperStyle={CHART_LEGEND_STYLE} iconType="circle" iconSize={8} />
            <Bar dataKey="Sales" stackId="sales" fill="var(--color-success)" maxBarSize={22} radius={[4, 4, 0, 0]} />
            {categories.map((c) => (
              <Bar key={c} dataKey={labelFor(c)} stackId="expenses" fill={expenseCategoryColor(c)} maxBarSize={22} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs min-[600px]:grid-cols-6">
        {profitTrend.map((p) => (
          <div key={p.label} className="rounded-lg bg-secondary/50 px-2 py-1.5">
            <div className="text-muted-foreground">{p.label} net</div>
            <div className={`font-semibold ${p.netProfit >= 0 ? "text-success" : "text-danger"}`}>{formatPesoAbbrev(p.netProfit)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Each product's share of this month's sales by value, with the unit leader named when it differs. */
function ProductShare() {
  const { entries, products } = useStore();
  const now = new Date();
  const rows = useMemo(() => {
    const totals = new Map<string, { revenue: number; units: number }>();
    for (const e of entries) {
      if (e.type !== "SALE") continue;
      const d = new Date(e.timestamp);
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
      const name = findProduct(products, e.sku)?.name ?? e.sku ?? "Other";
      const t = totals.get(name) ?? { revenue: 0, units: 0 };
      t.revenue += e.amount ?? 0;
      t.units += e.quantity ?? 0;
      totals.set(name, t);
    }
    return [...totals.entries()].map(([name, t]) => ({ name, ...t })).sort((a, b) => b.revenue - a.revenue);
    // `now` only changes by day, which a reload covers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, products]);

  const total = rows.reduce((s, r) => s + r.revenue, 0);
  const byUnits = [...rows].sort((a, b) => b.units - a.units)[0];

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">Share of sales by product</h3>
        <p className="text-xs text-muted-foreground">{currentMonthLabel()} · by peso value of sales</p>
      </div>
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No sales recorded this month yet.</p>
      ) : (
        <div className="flex flex-col items-center gap-4 min-[600px]:flex-row">
          <div className="h-[200px] w-[200px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="revenue" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={1} stroke="var(--card)">
                  {rows.map((r) => (
                    <Cell key={r.name} fill={productColor(products, r.name)} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip formatValue={(v) => formatPeso(Number(v))} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="w-full space-y-1.5 text-sm">
            {rows.map((r) => (
              <li key={r.name} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: productColor(products, r.name) }} />
                  {r.name}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {Math.round((r.revenue / total) * 100)}% · {formatPeso(r.revenue)}
                </span>
              </li>
            ))}
            {byUnits && rows[0] && byUnits.name !== rows[0].name && (
              <li className="pt-1 text-xs text-muted-foreground">
                By units sold, {byUnits.name} leads ({byUnits.units}), even though {rows[0].name} brings in the most money.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
