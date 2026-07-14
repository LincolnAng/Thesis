"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDateShort, formatPeso } from "@/lib/format";
import type { PriceHistoryPoint } from "@/lib/store/types";
import { CHART_AXIS_TICK, CHART_GRID_STROKE, ChartTooltip } from "@/components/summary/chart-theme";

export function PriceHistoryChart({ history }: { history: PriceHistoryPoint[] }) {
  if (history.length < 2) {
    return <p className="text-xs text-muted-foreground">Log a price change to see the trend over time.</p>;
  }

  const data = history.map((p) => ({ label: formatDateShort(p.date), price: p.price }));

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground">Price over time</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
            <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={{ stroke: CHART_GRID_STROKE }} tickLine={false} />
            <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<ChartTooltip formatValue={(v) => formatPeso(Number(v))} />} />
            <Line
              type="monotone"
              dataKey="price"
              name="Price"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
