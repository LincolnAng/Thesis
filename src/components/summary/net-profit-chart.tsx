"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chipColor } from "@/lib/chart-colors";
import { formatPeso, formatPesoAbbrev } from "@/lib/format";
import type { ProfitPoint } from "@/lib/summary/profit-summary";
import { CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_HEIGHT, CHART_LEGEND_STYLE } from "./chart-theme";

interface ProfitChartRow {
  label: string;
  Revenue: number;
  "Net profit": number;
  cogs: number;
  expenses: number;
}

function ProfitTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: ProfitChartRow }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Revenue:</span> {formatPeso(d.Revenue)}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Cost of goods:</span> −{formatPeso(d.cogs)}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Other expenses:</span> −{formatPeso(d.expenses)}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Net profit:</span> {formatPeso(d["Net profit"])}
      </p>
    </div>
  );
}

export function NetProfitChart({ data }: { data: ProfitPoint[] }) {
  const chartData: ProfitChartRow[] = data.map((d) => ({
    label: d.label,
    Revenue: d.revenue,
    "Net profit": d.netProfit,
    cogs: d.cogs,
    expenses: d.expenses,
  }));

  return (
    <div className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Revenue vs. net profit, last 6 months</h2>
      <p className="text-xs text-muted-foreground">The true bottom line — after ingredients and every other expense.</p>
      <div className={CHART_HEIGHT}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
            <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={{ stroke: CHART_GRID_STROKE }} tickLine={false} />
            <YAxis
              tick={CHART_AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) => formatPesoAbbrev(v)}
            />
            <Tooltip content={<ProfitTooltip />} />
            <Legend wrapperStyle={CHART_LEGEND_STYLE} iconType="circle" iconSize={8} />
            <Bar dataKey="Revenue" fill={chipColor(0)} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="Net profit" fill="var(--status-good)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
