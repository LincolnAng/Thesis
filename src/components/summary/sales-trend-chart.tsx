"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { linearTrend } from "@/lib/summary/regression";
import { formatPesoAbbrev } from "@/lib/format";
import type { TrendPoint } from "@/lib/summary/trend";
import { CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_HEIGHT, CHART_LEGEND_STYLE, ChartTooltip } from "./chart-theme";

export function SalesTrendChart({ data }: { data: TrendPoint[] }) {
  const fit = linearTrend(data.map((d) => d.value)).points;
  const chartData = data.map((d, i) => ({ label: d.label, Actual: d.value, Trend: Math.max(0, fit[i]) }));

  return (
    <div className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Revenue, last 6 months</h2>
      <div className={CHART_HEIGHT}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
            <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={{ stroke: CHART_GRID_STROKE }} tickLine={false} />
            <YAxis
              tick={CHART_AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) => formatPesoAbbrev(v)}
            />
            <Tooltip content={<ChartTooltip formatValue={(v) => formatPesoAbbrev(Number(v))} />} />
            <Legend wrapperStyle={CHART_LEGEND_STYLE} iconType="circle" iconSize={8} />
            <Line type="monotone" dataKey="Actual" stroke="var(--status-good)" strokeWidth={2} dot={{ r: 4 }} />
            <Line
              type="monotone"
              dataKey="Trend"
              stroke="var(--muted-foreground)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
