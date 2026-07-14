"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chipColor } from "@/lib/chart-colors";
import { formatNumber } from "@/lib/format";
import type { MonthlyTrendPoint } from "@/components/summary/monthly-trend-chart";
import { CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_HEIGHT, CHART_LEGEND_STYLE, ChartTooltip } from "./chart-theme";

export function StockProducedSoldChart({ data }: { data: MonthlyTrendPoint[] }) {
  const chartData = data.map((d) => ({ label: d.label, Produced: d.value, Sold: d.secondaryValue ?? 0 }));

  return (
    <div className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Produced vs. sold, last 6 months</h2>
      <div className={CHART_HEIGHT}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
            <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={{ stroke: CHART_GRID_STROKE }} tickLine={false} />
            <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<ChartTooltip formatValue={(v) => `${formatNumber(Number(v))} jars`} />} />
            <Legend wrapperStyle={CHART_LEGEND_STYLE} iconType="circle" iconSize={8} />
            <Bar dataKey="Produced" fill={chipColor(0)} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="Sold" fill={chipColor(1)} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
