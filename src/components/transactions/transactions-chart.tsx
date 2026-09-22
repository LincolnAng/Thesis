"use client";

import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chipColor } from "@/lib/chart-colors";
import { formatPeso, formatPesoAbbrev } from "@/lib/format";
import { CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_LEGEND_STYLE, CHART_Y_WIDTH, ChartTooltip } from "@/components/summary/chart-theme";

export interface MonthTotals {
  label: string;
  sales: number;
  expenses: number;
}

// Fixed categorical slots (validated palette), not the reserved green/amber status colors.
const SALES_COLOR = chipColor(1);
const EXPENSES_COLOR = chipColor(2);

/**
 * Sales and expenses per month, side by side, against the monthly sales target and the
 * expense budget. The two targets are horizontal reference lines on the same ₱ axis, so a
 * month's bars read directly as "over / under" each one.
 */
export function TransactionsChart({
  months,
  salesTarget,
  expenseBudget,
}: {
  months: MonthTotals[];
  salesTarget: number;
  expenseBudget: number;
}) {
  const peak = Math.max(salesTarget, expenseBudget, ...months.flatMap((m) => [m.sales, m.expenses]));

  return (
    <div style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={months} margin={{ top: 16, right: 16, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
          <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={{ stroke: CHART_GRID_STROKE }} tickLine={false} />
          <YAxis
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={CHART_Y_WIDTH}
            domain={[0, Math.ceil(peak * 1.1) || 100]}
            tickFormatter={(v: number) => formatPesoAbbrev(v)}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={<ChartTooltip formatValue={(v) => formatPeso(Number(v))} />}
          />
          <Legend wrapperStyle={CHART_LEGEND_STYLE} iconType="circle" iconSize={8} />
          <Bar dataKey="sales" name="Sales" fill={SALES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expenses" name="Expenses" fill={EXPENSES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
          {salesTarget > 0 && (
            <ReferenceLine
              y={salesTarget}
              stroke={SALES_COLOR}
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{
                value: `Sales target ${formatPesoAbbrev(salesTarget)}`,
                position: "insideTopRight",
                fill: "var(--muted-foreground)",
                fontSize: 11,
              }}
            />
          )}
          {expenseBudget > 0 && (
            <ReferenceLine
              y={expenseBudget}
              stroke={EXPENSES_COLOR}
              strokeDasharray="2 3"
              strokeWidth={1.5}
              label={{
                value: `Expense budget ${formatPesoAbbrev(expenseBudget)}`,
                position: "insideBottomRight",
                fill: "var(--muted-foreground)",
                fontSize: 11,
              }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
