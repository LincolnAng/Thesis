"use client";

import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { formatNumber, formatPeso, formatPesoAbbrev } from "@/lib/format";
import { linearTrend } from "@/lib/summary/regression";
import { cn } from "@/lib/utils";

export interface MonthlyTrendPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

export type MonthlyTrendMetric = "sales" | "stock";

const METRIC_TAKEAWAY_LABEL: Record<MonthlyTrendMetric, string> = {
  sales: "sales",
  stock: "product sales",
};

const METRIC_CAPTION: Record<MonthlyTrendMetric, string> = {
  sales: "Each bar is that month's total sales.",
  stock: "Tan bars are jars made, green bars are jars sold.",
};

// Below this many non-zero months, a regression trend is mostly an artifact
// of sparse data and shouldn't be reported as a confident percentage.
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
}

function ChartTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  metric: MonthlyTrendMetric;
}) {
  if (!active || !payload) return null;
  // Never surface the regression line's raw predicted value — it's an internal
  // computation, not something meant to be read as a number by the owner.
  const visible = payload.filter((p) => p.dataKey !== "trend");
  if (visible.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs" style={{ background: "var(--card)" }}>
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {visible.map((p) => (
        <p key={p.dataKey} className="text-muted-foreground">
          {p.name}: {metric === "stock" ? `${formatNumber(Number(p.value))} jars` : formatPeso(Number(p.value))}
        </p>
      ))}
    </div>
  );
}

export function MonthlyTrendChart({ data, metric }: { data: MonthlyTrendPoint[]; metric: MonthlyTrendMetric }) {
  const trendSeries = metric === "stock" ? data.map((d) => d.secondaryValue ?? 0) : data.map((d) => d.value);
  const nonZeroMonths = trendSeries.filter((v) => v !== 0).length;
  const hasEnoughData = nonZeroMonths >= MIN_MONTHS_FOR_TREND;

  const trend = linearTrend(trendSeries);
  const rising = hasEnoughData && trend.slope > 0;
  const falling = hasEnoughData && trend.slope < 0;
  const isFavorable = rising; // for sales/stock, rising is the good direction
  const trendColor = !rising && !falling ? "var(--muted-foreground)" : isFavorable ? "var(--status-good)" : "var(--status-warning)";

  const chartData = data.map((d, i) => ({ ...d, trend: hasEnoughData ? trend.points[i] : undefined }));
  const lastIndex = data.length - 1;

  const label = METRIC_TAKEAWAY_LABEL[metric];
  const pctAbs = Math.round(Math.abs(trend.pctPerMonth));
  const takeaway = !hasEnoughData
    ? "Not enough data yet — keep logging to see a clear trend."
    : !rising && !falling
      ? `Your ${label} has been steady over the past few months.`
      : `Your ${label} has ${rising ? "risen" : "dropped"} by about ${pctAbs}% per month. ${
          isFavorable ? "Keep it up!" : "Worth keeping an eye on."
        }`;

  const barColor = metric === "sales" ? "var(--status-good)" : "var(--primary)";

  return (
    <div className="space-y-2 rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Last 6 months</h2>
        {hasEnoughData && (rising || falling) ? (
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
              tickFormatter={(v: number) => (metric === "stock" ? formatNumber(v) : formatPesoAbbrev(v))}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip metric={metric} />} />
            {metric === "stock" ? (
              <>
                <Bar dataKey="value" name="Produced" fill="var(--primary)" radius={[4, 4, 0, 0]} barSize={10} />
                <Bar
                  dataKey="secondaryValue"
                  name="Sold"
                  fill="var(--status-good)"
                  radius={[4, 4, 0, 0]}
                  barSize={10}
                />
              </>
            ) : (
              <Bar dataKey="value" name="Revenue" fill={barColor} fillOpacity={0.7} radius={[4, 4, 0, 0]} barSize={18} />
            )}
            {hasEnoughData && (
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
        {METRIC_CAPTION[metric]} {hasEnoughData && "The dashed line shows the general direction."}
      </p>
      <p className="text-xs text-muted-foreground">{takeaway}</p>
    </div>
  );
}
