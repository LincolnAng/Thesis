"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORY_ORDER, expenseCategoryColor, type MonthlyCategoryPoint } from "@/lib/summary/expenses-summary";
import { EXPENSE_CATEGORY_LABELS, formatPesoAbbrev } from "@/lib/format";
import { CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_HEIGHT, CHART_LEGEND_STYLE, ChartTooltip } from "./chart-theme";

export function ExpensesCategoryChart({ data }: { data: MonthlyCategoryPoint[] }) {
  const chartData = data.map((point) => {
    const row: Record<string, string | number> = { label: point.label };
    for (const category of CATEGORY_ORDER) row[EXPENSE_CATEGORY_LABELS[category]] = point.byCategory[category] ?? 0;
    return row;
  });

  return (
    <div className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">By category, last 6 months</h2>
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
            <Tooltip content={<ChartTooltip formatValue={(v) => formatPesoAbbrev(Number(v))} />} />
            <Legend wrapperStyle={CHART_LEGEND_STYLE} iconType="circle" iconSize={8} />
            {CATEGORY_ORDER.map((category) => (
              <Bar
                key={category}
                dataKey={EXPENSE_CATEGORY_LABELS[category]}
                stackId="expenses"
                fill={expenseCategoryColor(category)}
                maxBarSize={24}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
