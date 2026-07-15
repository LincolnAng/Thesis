"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/use-store";
import { computeSalesSummary } from "@/lib/summary/sales-summary";
import { formatPeso, previousMonthShortLabel } from "@/lib/format";
import { ComparisonBadge } from "@/components/summary/comparison-badge";
import { Sparkline } from "@/components/summary/sparkline";
import { MonthlyTrendChart } from "@/components/summary/monthly-trend-chart";
import { SalesTrendChart } from "@/components/summary/sales-trend-chart";
import { NetProfitChart } from "@/components/summary/net-profit-chart";
import { CogsPercentChart } from "@/components/summary/cogs-percent-chart";
import { ProfitableProductsList } from "@/components/summary/profitable-products-list";
import { computeMonthlyProfitTrend, computeProductMarginRanking } from "@/lib/summary/profit-summary";
import { useViewMode } from "@/lib/summary/view-mode";

export function SalesDetail() {
  const { entries, products, rawMaterials } = useStore();
  const summary = useMemo(
    () => computeSalesSummary(entries, products, rawMaterials),
    [entries, products, rawMaterials],
  );
  const profitTrend = useMemo(
    () => computeMonthlyProfitTrend(entries, products, rawMaterials),
    [entries, products, rawMaterials],
  );
  const marginRanking = useMemo(
    () => computeProductMarginRanking(entries, products, rawMaterials),
    [entries, products, rawMaterials],
  );
  const lastMonthLabel = previousMonthShortLabel();
  const [viewMode] = useViewMode();

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-4xl font-bold text-[var(--status-good)]">{formatPeso(summary.revenue)}</p>
              <ComparisonBadge pct={summary.revenueChangePct} comparedToLabel={lastMonthLabel} favorableWhen="up" />
            </div>
            <p className="text-sm text-muted-foreground">
              {summary.jarsSold} jars sold · about {formatPeso(summary.avgPerJar)} per jar ·{" "}
              {formatPeso(summary.profit)} of this is profit
            </p>
            {viewMode === "advanced" && (
              <p className="text-sm text-muted-foreground">Gross margin: {Math.round(summary.grossMarginPct)}%</p>
            )}
          </div>
          <Sparkline points={summary.trend} />
        </div>
      </div>

      <MonthlyTrendChart data={summary.trend} metric="sales" />
      {viewMode === "advanced" && (
        <>
          <SalesTrendChart data={summary.trend} />
          <NetProfitChart data={profitTrend} />
          <CogsPercentChart data={profitTrend} />
        </>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Best sellers</h2>
        {summary.bestSellers.length === 0 ? (
          <p className="text-base text-muted-foreground">No sales logged yet this month.</p>
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border">
            {summary.bestSellers.map((s, i) => (
              <div key={s.sku} className="flex items-center justify-between gap-2 px-4 py-3">
                <span className="flex min-w-0 items-center gap-2 text-base font-medium text-foreground">
                  <span className="shrink-0 text-muted-foreground">{i + 1}.</span>
                  <span className="truncate">{s.sku}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-semibold text-foreground">{formatPeso(s.revenue)}</span>
                  <span className="block text-sm text-muted-foreground">{s.qty} jars</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewMode === "advanced" && <ProfitableProductsList rows={marginRanking} />}

      {summary.byPriceType.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">By price type</h2>
          <div className="divide-y divide-border rounded-2xl border border-border">
            {summary.byPriceType.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-2 px-4 py-3">
                <span className="text-base font-medium text-foreground">{row.label}</span>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-semibold text-foreground">{formatPeso(row.revenue)}</span>
                  <span className="block text-sm text-muted-foreground">{row.qty} jars</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
