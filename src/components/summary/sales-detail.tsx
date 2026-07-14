"use client";

import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { computeSalesSummary } from "@/lib/summary/sales-summary";
import { formatDate, formatPeso, previousMonthShortLabel } from "@/lib/format";
import { ComparisonBadge } from "@/components/summary/comparison-badge";
import { Sparkline } from "@/components/summary/sparkline";
import { MonthlyTrendChart } from "@/components/summary/monthly-trend-chart";
import { SalesTrendChart } from "@/components/summary/sales-trend-chart";
import { useViewMode } from "@/lib/summary/view-mode";

export function SalesDetail() {
  const { entries, products, rawMaterials } = useStore();
  const summary = useMemo(
    () => computeSalesSummary(entries, products, rawMaterials),
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
          </div>
          <Sparkline points={summary.trend} />
        </div>
      </div>

      <MonthlyTrendChart data={summary.trend} metric="sales" />
      {viewMode === "advanced" && <SalesTrendChart data={summary.trend} />}

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

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Recent sales</h2>
        {summary.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border">
            {summary.recent.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--status-good)]/15">
                  <ArrowUpRight className="h-4 w-4 text-[var(--status-good)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{e.sku ?? "Sale"}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(e.timestamp)}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-[var(--status-good)]">+{formatPeso(e.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
