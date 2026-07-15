"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chipColor } from "@/lib/chart-colors";
import { formatPeso, formatPesoAbbrev } from "@/lib/format";
import type { Supplier } from "@/lib/store/types";
import { CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_HEIGHT, ChartTooltip } from "./chart-theme";

function truncateLabel(name: string): string {
  return name.length > 14 ? `${name.slice(0, 14)}…` : name;
}

export function SupplierPriceSummaryChart({ suppliers }: { suppliers: Supplier[] }) {
  const chartData = suppliers.map((s) => {
    const history = s.priceHistory.length > 0 ? s.priceHistory : [{ date: "", price: s.lastPrice }];
    const avgPrice = history.reduce((sum, p) => sum + p.price, 0) / history.length;
    return { name: s.name, "Avg price": Math.round(avgPrice * 100) / 100 };
  });

  if (chartData.length === 0) return null;

  return (
    <div className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Average price by supplier</h2>
      <p className="text-xs text-muted-foreground">The average price paid across each supplier&apos;s logged history.</p>
      <div className={CHART_HEIGHT}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="name"
              tick={CHART_AXIS_TICK}
              axisLine={{ stroke: CHART_GRID_STROKE }}
              tickLine={false}
              tickFormatter={truncateLabel}
              interval={0}
            />
            <YAxis
              tick={CHART_AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) => formatPesoAbbrev(v)}
            />
            <Tooltip content={<ChartTooltip formatValue={(v) => formatPeso(Number(v))} />} />
            <Bar dataKey="Avg price" radius={[4, 4, 0, 0]} maxBarSize={32}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={chipColor(i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
