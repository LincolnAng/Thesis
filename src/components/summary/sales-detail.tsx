"use client";

import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { computeSalesSummary } from "@/lib/summary/sales-summary";
import { formatDate, formatPeso, previousMonthShortLabel } from "@/lib/format";
import { ComparisonBadge } from "@/components/summary/comparison-badge";
import { DonutChart } from "@/components/summary/donut-chart";
import { Sparkline } from "@/components/summary/sparkline";
import { MonthlyTrendChart } from "@/components/summary/monthly-trend-chart";

export function SalesDetail() {
  const { entries, products, rawMaterials } = useStore();
  const summary = useMemo(
    () => computeSalesSummary(entries, products, rawMaterials),
    [entries, products, rawMaterials],
  );
  const lastMonthLabel = previousMonthShortLabel();

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

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Best sellers</h2>
        {summary.bestSellers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales logged yet this month.</p>
        ) : (
          <div className="flex items-center gap-4 rounded-2xl border border-border p-4">
            <DonutChart
              segments={summary.bestSellers.map((s) => ({ label: s.sku, value: s.revenue, color: s.color }))}
              size={80}
              thickness={12}
            />
            <div className="flex-1 space-y-2.5">
              {summary.bestSellers.map((s) => (
                <div key={s.sku} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.sku}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-foreground">{formatPeso(s.revenue)}</span>
                  </div>
                  <p className="pl-3.5 text-xs text-muted-foreground">{s.qty} jars</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {summary.byPriceType.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">By price type</h2>
          <div className="flex items-center gap-4 rounded-2xl border border-border p-4">
            <DonutChart
              segments={summary.byPriceType.map((r) => ({ label: r.label, value: r.revenue, color: r.color }))}
              size={72}
              thickness={11}
            />
            <div className="flex-1 space-y-2">
              {summary.byPriceType.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                    {row.label}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {row.qty} jars · <span className="font-semibold text-foreground">{formatPeso(row.revenue)}</span>
                  </span>
                </div>
              ))}
            </div>
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
