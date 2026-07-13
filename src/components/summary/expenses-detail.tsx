"use client";

import { useMemo } from "react";
import { ArrowDownRight } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { computeExpensesSummary, monthlyExpensesByCategory } from "@/lib/summary/expenses-summary";
import { CATEGORY_ICONS } from "@/lib/summary/category-icons";
import { currentMonthLabel, formatDate, formatPeso, previousMonthShortLabel } from "@/lib/format";
import { Bar } from "@/components/summary/bar";
import { ComparisonBadge } from "@/components/summary/comparison-badge";
import { DonutChart } from "@/components/summary/donut-chart";
import { Sparkline } from "@/components/summary/sparkline";
import { ExpensesTrendChart } from "@/components/summary/expenses-trend-chart";
import { cn } from "@/lib/utils";

export function ExpensesDetail() {
  const { entries, categoryBudgets } = useStore();
  const summary = useMemo(() => computeExpensesSummary(entries, categoryBudgets), [entries, categoryBudgets]);
  const categoryTrend = useMemo(() => monthlyExpensesByCategory(entries), [entries]);
  const lastMonthLabel = previousMonthShortLabel();
  const monthLabel = currentMonthLabel();

  const overBudget = summary.remaining < 0;
  const budgetBarPct = summary.budget > 0 ? (summary.total / summary.budget) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-4xl font-bold text-[var(--status-warning)]">{formatPeso(summary.total)}</p>
              <ComparisonBadge pct={summary.changePct} comparedToLabel={lastMonthLabel} favorableWhen="down" />
            </div>

            <p className="text-sm text-muted-foreground">
              {overBudget
                ? `You planned ${formatPeso(summary.budget)} for ${monthLabel} — you're ${formatPeso(Math.abs(summary.remaining))} over`
                : `You planned ${formatPeso(summary.budget)} for ${monthLabel} — ${formatPeso(summary.remaining)} still available`}
            </p>
          </div>
          <Sparkline points={summary.trend} />
        </div>
        <Bar pct={budgetBarPct} tone={overBudget ? "warning" : "neutral"} />
        <p className="text-xs text-muted-foreground">
          {formatPeso(summary.total)} of {formatPeso(summary.budget)}
        </p>
      </div>

      <ExpensesTrendChart data={categoryTrend} totalBudget={summary.budget} />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Where it went</h2>
        {summary.byCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses logged yet this month.</p>
        ) : (
          <div className="space-y-4 rounded-2xl border border-border p-4">
            <div className="flex items-center gap-4">
              <DonutChart segments={summary.byCategory.map((r) => ({ label: r.label, value: r.amount, color: r.color }))} />
              <div className="flex-1 space-y-2.5">
                {summary.byCategory.map((row) => {
                  const Icon = CATEGORY_ICONS[row.category];
                  return (
                    <div key={row.category} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: row.color }} />
                        {row.label}
                      </span>
                      <span className="text-right text-sm">
                        <span className="font-semibold text-foreground">{formatPeso(row.amount)}</span>{" "}
                        <span className="text-xs text-muted-foreground">({row.pctOfTotal}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-3">
              {summary.byCategory.map((row) => (
                <div key={row.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className={cn(row.overBudget ? "font-semibold text-[var(--status-warning)]" : "text-muted-foreground")}>
                      {formatPeso(row.amount)} of {formatPeso(row.budget)}
                    </span>
                  </div>
                  <Bar pct={row.budget > 0 ? (row.amount / row.budget) * 100 : 0} tone={row.overBudget ? "warning" : "neutral"} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Recent expenses</h2>
        {summary.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border">
            {summary.recent.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--status-warning)]/15">
                  <ArrowDownRight className="h-4 w-4 text-[var(--status-warning)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{e.sku ?? e.rawText}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(e.timestamp)}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-[var(--status-warning)]">−{formatPeso(e.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
