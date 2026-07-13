import { linearTrend } from "@/lib/summary/regression";

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

// Below this many non-zero months, a regression trend is mostly an artifact
// of sparse data and shouldn't be reported as a confident percentage.
const MIN_MONTHS_FOR_TREND = 3;

export function MonthlyTrendChart({ data, metric }: { data: MonthlyTrendPoint[]; metric: MonthlyTrendMetric }) {
  const trendSeries = metric === "stock" ? data.map((d) => d.secondaryValue ?? 0) : data.map((d) => d.value);
  const nonZeroMonths = trendSeries.filter((v) => v !== 0).length;
  const hasEnoughData = nonZeroMonths >= MIN_MONTHS_FOR_TREND;

  const trend = linearTrend(trendSeries);
  const rising = hasEnoughData && trend.slope > 0;
  const falling = hasEnoughData && trend.slope < 0;
  const isFavorable = rising; // for sales/stock, rising is the good direction

  const label = METRIC_TAKEAWAY_LABEL[metric];
  const pctAbs = Math.round(Math.abs(trend.pctPerMonth));
  const takeaway = !hasEnoughData
    ? "Not enough history yet to see a trend — keep logging."
    : !rising && !falling
      ? `Your ${label} has been steady over the past few months.`
      : `Your ${label} has ${rising ? "gone up" : "gone down"} by about ${pctAbs}% a month. ${
          isFavorable ? "Nice — keep it up!" : "Worth keeping an eye on."
        }`;

  return (
    <div className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Last 6 months</h2>
      <p className="text-base text-foreground">{takeaway}</p>
    </div>
  );
}
