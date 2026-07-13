import { linearTrend } from "@/lib/summary/regression";
import type { MonthlyCategoryPoint } from "@/lib/summary/expenses-summary";

const MIN_MONTHS_FOR_TREND = 3;

export function ExpensesTrendChart({ data, totalBudget }: { data: MonthlyCategoryPoint[]; totalBudget: number }) {
  const trendSeries = data.map((d) => d.total);
  const nonZeroMonths = trendSeries.filter((v) => v !== 0).length;
  const hasEnoughData = nonZeroMonths >= MIN_MONTHS_FOR_TREND;

  const trend = linearTrend(trendSeries);
  const rising = hasEnoughData && trend.slope > 0;
  const falling = hasEnoughData && trend.slope < 0;
  const isFavorable = falling; // for expenses, falling is the good direction

  const showBudget = totalBudget > 0;
  const overBudgetCount = showBudget ? data.filter((d) => d.total > totalBudget).length : 0;

  const pctAbs = Math.round(Math.abs(trend.pctPerMonth));
  const trendSentence = !hasEnoughData
    ? "Not enough history yet to see a trend — keep logging."
    : !rising && !falling
      ? "Your expenses have been steady over the past few months."
      : `Your expenses have ${rising ? "gone up" : "gone down"} by about ${pctAbs}% a month. ${
          isFavorable ? "Nice — keep it up!" : "Worth keeping an eye on."
        }`;

  const budgetSentence = showBudget
    ? overBudgetCount > 0
      ? `You went over budget in ${overBudgetCount} of the last ${data.length} months.`
      : `You stayed within budget every month for the last ${data.length} months.`
    : null;

  return (
    <div className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Last 6 months</h2>
      <p className="text-base text-foreground">{trendSentence}</p>
      {budgetSentence && <p className="text-base text-foreground">{budgetSentence}</p>}
    </div>
  );
}
