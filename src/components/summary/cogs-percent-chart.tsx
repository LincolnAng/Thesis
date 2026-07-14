"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProfitPoint } from "@/lib/summary/profit-summary";
import { CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_HEIGHT, ChartTooltip } from "./chart-theme";

export function CogsPercentChart({ data }: { data: ProfitPoint[] }) {
  const chartData = data.map((d) => ({
    label: d.label,
    "Cost of goods": Math.round(d.cogsPct * 10) / 10,
  }));

  return (
    <div className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Ingredient cost as a share of revenue</h2>
      <p className="text-xs text-muted-foreground">Rising means ingredient prices are eating more of every peso you make.</p>
      <div className={CHART_HEIGHT}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
            <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={{ stroke: CHART_GRID_STROKE }} tickLine={false} />
            <YAxis
              tick={CHART_AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip content={<ChartTooltip formatValue={(v) => `${v}%`} />} />
            <Line
              type="monotone"
              dataKey="Cost of goods"
              name="Cost of goods"
              stroke="var(--status-warning)"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
