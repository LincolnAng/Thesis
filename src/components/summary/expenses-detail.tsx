"use client";

import { useMemo } from "react";
import { ArrowDownRight } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { computeExpensesSummary, monthlyExpensesByCategory } from "@/lib/summary/expenses-summary";
import { CATEGORY_ICONS } from "@/lib/summary/category-icons";
import { currentMonthLabel, formatDate, formatPeso, previousMonthShortLabel } from "@/lib/format";
import { Bar } from "@/components/summary/bar";
import { ComparisonBadge } from "@/components/summary/comparison-badge";
import { Sparkline } from "@/components/summary/sparkline";
import { ExpensesTrendChart } from "@/components/summary/expenses-trend-chart";
import { ExpensesCategoryChart } from "@/components/summary/expenses-category-chart";
import { useViewMode } from "@/lib/summary/view-mode";
import { cn } from "@/lib/utils";

export function ExpensesDetail() {
  const { entries, categoryBudgets } = useStore();
  const summary = useMemo(() => computeExpensesSummary(entries, categoryBudgets), [entries, categoryBudgets]);
  const categoryTrend = useMemo(() => monthlyExpensesByCategory(entries), [entries]);
  const lastMonthLabel = previousMonthShortLabel();
  const monthLabel = currentMonthLabel();
  const [viewMode] = useViewMode();

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
      {viewMode === "advanced" && <ExpensesCategoryChart data={categoryTrend} />}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Where it went</h2>
        {summary.byCategory.length === 0 ? (
          <p className="text-base text-muted-foreground">No expenses logged yet this month.</p>
        ) : (
          <div className="space-y-4 rounded-2xl border border-border p-4">
            {summary.byCategory.map((row) => {
              const Icon = CATEGORY_ICONS[row.category];
              return (
                <div key={row.category} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-base font-medium text-foreground">
                      <Icon className="h-4 w-4 shrink-0" style={{ color: row.color }} />
                      {row.label}
                    </span>
                    <span className="text-right text-base">
                      <span className="font-semibold text-foreground">{formatPeso(row.amount)}</span>{" "}
                      <span className="text-sm text-muted-foreground">({row.pctOfTotal}%)</span>
                    </span>
                  </div>
                  <Bar
                    pct={row.budget > 0 ? (row.amount / row.budget) * 100 : row.barPct}
                    tone={row.overBudget ? "warning" : "neutral"}
                  />
                  {row.budget > 0 && (
                    <p
                      className={cn(
                        "text-sm",
                        row.overBudget ? "font-semibold text-[var(--status-warning)]" : "text-muted-foreground",
                      )}
                    >
                      {formatPeso(row.amount)} of {formatPeso(row.budget)}
                    </p>
                  )}
                </div>
              );
            })}
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
