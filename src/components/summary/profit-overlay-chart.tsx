"use client";

import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPeso, formatPesoAbbrev } from "@/lib/format";
import { ChartPanel } from "@/components/layout/containers";
import {
  CHART_AXIS_TICK,
  CHART_GRID_STROKE,
  CHART_HEIGHT,
  CHART_LEGEND_STYLE,
  CHART_Y_WIDTH,
  ChartTooltip,
} from "./chart-theme";
import type { ProfitPoint } from "@/lib/summary/profit-summary";

/**
 * Revenue, expenses and what's left, on one pair of axes.
 *
 * These were three separate cards, which meant comparing them was a memory exercise —
 * scroll up, hold a number, scroll down. Overlaid, the month where costs outran income is
 * the month where the lines cross.
 */
export function ProfitOverlayChart({ data }: { data: ProfitPoint[] }) {
  return (
    <ChartPanel title="Revenue, costs and profit">
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis
              tick={CHART_AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={CHART_Y_WIDTH}
              tickFormatter={(v) => formatPesoAbbrev(Number(v))}
            />
            <Tooltip content={<ChartTooltip formatValue={(v) => formatPeso(Number(v))} />} />
            <Legend wrapperStyle={CHART_LEGEND_STYLE} />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="var(--status-good)"
              fill="var(--status-good)"
              fillOpacity={0.12}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="expenses"
              name="Expenses"
              stroke="var(--status-warning)"
              fill="var(--status-warning)"
              fillOpacity={0.12}
              strokeWidth={2}
            />
            <Line type="monotone" dataKey="netProfit" name="Net profit" stroke="var(--primary)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartPanel>
  );
}
