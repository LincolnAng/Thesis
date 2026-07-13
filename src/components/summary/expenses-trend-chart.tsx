"use client";

import { Bar, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { EXPENSE_CATEGORY_LABELS, formatPeso, formatPesoAbbrev } from "@/lib/format";
import { linearTrend } from "@/lib/summary/regression";
import { CATEGORY_ORDER, expenseCategoryColor, type MonthlyCategoryPoint } from "@/lib/summary/expenses-summary";
import { cn } from "@/lib/utils";

const MIN_MONTHS_FOR_TREND = 3;

function LastPointDot({
  cx,
  cy,
  index,
  lastIndex,
  color,
}: {
  cx?: number;
  cy?: number;
  index?: number;
  lastIndex: number;
  color: string;
}) {
  if (index !== lastIndex || cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--card)" strokeWidth={1.5} />;
}

interface TooltipPayloadItem {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload) return null;
  const visible = payload.filter((p) => p.dataKey !== "trend" && Number(p.value ?? 0) > 0);
  if (visible.length === 0) return null;
  const total = visible.reduce((s, p) => s + Number(p.value ?? 0), 0);

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs" style={{ background: "var(--card)" }}>
      <p className="mb-1 font-semibold text-foreground">
        {label} · {formatPeso(total)}
      </p>
      {visible.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: {formatPeso(Number(p.value))}
        </p>
      ))}
    </div>
  );
}

export function ExpensesTrendChart({ data, totalBudget }: { data: MonthlyCategoryPoint[]; totalBudget: number }) {
  const trendSeries = data.map((d) => d.total);
  const nonZeroMonths = trendSeries.filter((v) => v !== 0).length;
  const hasEnoughData = nonZeroMonths >= MIN_MONTHS_FOR_TREND;

  const trend = linearTrend(trendSeries);
  const rising = hasEnoughData && trend.slope > 0;
  const falling = hasEnoughData && trend.slope < 0;
  const isFavorable = falling; // for expenses, falling is the good direction
  const trendColor = !rising && !falling ? "var(--muted-foreground)" : isFavorable ? "var(--status-good)" : "var(--status-warning)";

  const showBudget = totalBudget > 0;
  const showTrendLine = hasEnoughData && !showBudget;
  const overBudgetCount = showBudget ? data.filter((d) => d.total > totalBudget).length : 0;

  const chartData = data.map((d, i) => ({
    label: d.label,
    total: d.total,
    ...d.byCategory,
    trend: hasEnoughData ? trend.points[i] : undefined,
  }));
  const lastIndex = data.length - 1;

  const pctAbs = Math.round(Math.abs(trend.pctPerMonth));
  const takeaway = !hasEnoughData
    ? "Not enough data yet — keep logging to see a clear trend."
    : !rising && !falling
      ? "Your expenses have been steady over the past few months."
      : `Your expenses have ${rising ? "risen" : "dropped"} by about ${pctAbs}% per month. ${
          isFavorable ? "Keep it up!" : "Worth keeping an eye on."
        }`;

  return (
    <div className="space-y-2 rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Last 6 months, by category</h2>
        {showBudget ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
              overBudgetCount > 0
                ? "bg-[var(--status-warning)]/15 text-[var(--status-warning)]"
                : "bg-[var(--status-good)]/15 text-[var(--status-good)]",
            )}
          >
            {overBudgetCount > 0 ? `${overBudgetCount}/${data.length} over budget` : "All within budget"}
          </span>
        ) : hasEnoughData && (rising || falling) ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
              isFavorable
                ? "bg-[var(--status-good)]/15 text-[var(--status-good)]"
                : "bg-[var(--status-warning)]/15 text-[var(--status-warning)]",
            )}
          >
            {rising ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {rising ? "Rising" : "Falling"}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Not enough data yet
          </span>
        )}
      </div>

      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 6, right: 4, left: -12, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, "auto"]}
              tickFormatter={(v: number) => formatPesoAbbrev(v)}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip />} />
            {CATEGORY_ORDER.map((category) => (
              <Bar
                key={category}
                dataKey={category}
                name={EXPENSE_CATEGORY_LABELS[category] ?? category}
                stackId="expenses"
                fill={expenseCategoryColor(category)}
                fillOpacity={0.8}
              />
            ))}
            {showBudget && (
              <ReferenceLine
                y={totalBudget}
                ifOverflow="extendDomain"
                stroke="var(--muted-foreground)"
                strokeDasharray="3 3"
                label={{
                  value: `Budget ${formatPesoAbbrev(totalBudget)}`,
                  position: "insideTopRight",
                  fill: "var(--muted-foreground)",
                  fontSize: 10,
                }}
              />
            )}
            {showTrendLine && (
              <Line
                dataKey="trend"
                stroke={trendColor}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={(props: { cx?: number; cy?: number; index?: number }) => (
                  <LastPointDot key={props.index} {...props} lastIndex={lastIndex} color={trendColor} />
                )}
                activeDot={false}
                isAnimationActive={false}
                type="monotone"
                legendType="none"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-muted-foreground">
        Each bar is split by category.{showBudget && " The dotted line marks your total budget."}{" "}
        {showTrendLine && "The dashed line shows the general direction."}
      </p>
      <p className="text-xs text-muted-foreground">{takeaway}</p>
    </div>
  );
}
