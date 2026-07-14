"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PLATFORMS, type WeeklyFollowersPoint } from "@/lib/marketing/social-derive";
import { chipColor } from "@/lib/chart-colors";
import { formatDateShort, formatNumber } from "@/lib/format";
import { CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_HEIGHT, CHART_LEGEND_STYLE, ChartTooltip } from "@/components/summary/chart-theme";

export function FollowersHistoryChart({ data }: { data: WeeklyFollowersPoint[] }) {
  if (data.length < 2) {
    return <p className="text-xs text-muted-foreground">Log a few more weeks to see the trend over time.</p>;
  }

  const chartData = data.map((d) => ({ ...d, label: formatDateShort(d.weekOf) }));

  return (
    <div className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Followers over time</h2>
      <div className={CHART_HEIGHT}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
            <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={{ stroke: CHART_GRID_STROKE }} tickLine={false} />
            <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<ChartTooltip formatValue={(v) => formatNumber(Number(v))} />} />
            <Legend wrapperStyle={CHART_LEGEND_STYLE} iconType="circle" iconSize={8} />
            {PLATFORMS.map((platform, i) => (
              <Line
                key={platform}
                type="monotone"
                dataKey={platform}
                stroke={chipColor(i)}
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
