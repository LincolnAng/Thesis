"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Panel } from "@/components/layout/containers";
import { EXPENSE_CATEGORY_LABELS, formatPeso } from "@/lib/format";
import { allExpenseCategories, expenseCategoryColor } from "@/lib/summary/expenses-summary";
import type { ExpenseCategory } from "@/lib/store/types";
import { cn } from "@/lib/utils";

interface Slice {
  category: ExpenseCategory;
  label: string;
  color: string;
  budget: number;
  spent: number;
}

interface Hover {
  slice: Slice;
  row: "budget" | "spent";
  x: number;
}

/**
 * The month's total budget as one bar split into each category's share, with what's
 * been spent so far directly beneath it on the same scale — so a category eating more
 * than its slice is visible as a longer segment, not just a number in a list.
 */
export function BudgetBreakdownChart({
  categoryBudgets,
  spentByCategory,
}: {
  categoryBudgets: Partial<Record<ExpenseCategory, number>>;
  spentByCategory: Map<ExpenseCategory, number>;
}) {
  const [hover, setHover] = useState<Hover | null>(null);

  // Fixed category order (not sorted by size), so each category keeps its position and
  // color no matter how the amounts move.
  const slices = useMemo<Slice[]>(
    () =>
      allExpenseCategories(categoryBudgets)
        .map((category) => ({
          category,
          label: EXPENSE_CATEGORY_LABELS[category] ?? category,
          color: expenseCategoryColor(category),
          budget: categoryBudgets[category] ?? 0,
          spent: spentByCategory.get(category) ?? 0,
        }))
        .filter((s) => s.budget > 0 || s.spent > 0),
    [categoryBudgets, spentByCategory],
  );

  const totalBudget = slices.reduce((sum, s) => sum + s.budget, 0);
  const totalSpent = slices.reduce((sum, s) => sum + s.spent, 0);
  // One scale for both bars — whichever is bigger fills the full width.
  const scale = Math.max(totalBudget, totalSpent);

  if (totalBudget <= 0) {
    return (
      <Panel title="Monthly budget">
        <p className="text-sm text-muted-foreground">
          No budget set yet. Tap &ldquo;Set budget&rdquo; to plan how much each category gets this month.
        </p>
      </Panel>
    );
  }

  const bars: { row: Hover["row"]; label: string; total: number; value: (s: Slice) => number }[] = [
    { row: "budget", label: "Budget", total: totalBudget, value: (s) => s.budget },
    { row: "spent", label: "Spent so far", total: totalSpent, value: (s) => s.spent },
  ];

  return (
    <Panel title="Monthly budget" action={<span className="type-meta text-muted-foreground">{formatPeso(totalBudget)} total</span>}>
      <div className="relative space-y-3" onMouseLeave={() => setHover(null)}>
        {bars.map((bar) => (
          <div key={bar.row} className="grid grid-cols-[96px_1fr_auto] items-center gap-3">
            <span className="text-sm text-muted-foreground">{bar.label}</span>
            {/* The track is the full scale; segments sit on it with a 2px surface gap between them. */}
            <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[4px] bg-muted">
              {slices
                .filter((s) => bar.value(s) > 0)
                .map((s) => (
                  <div
                    key={s.category}
                    className={cn(
                      "h-full shrink-0 transition-opacity",
                      hover && hover.slice.category !== s.category && "opacity-40",
                    )}
                    style={{ width: `${(bar.value(s) / scale) * 100}%`, backgroundColor: s.color }}
                    onMouseEnter={(e) => {
                      const parent = e.currentTarget.closest("[data-budget-chart]") as HTMLElement | null;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const base = parent?.getBoundingClientRect().left ?? 0;
                      setHover({ slice: s, row: bar.row, x: rect.left - base + rect.width / 2 });
                    }}
                  />
                ))}
            </div>
            <span className="w-20 text-right text-sm font-medium tabular-nums text-foreground">{formatPeso(bar.total)}</span>
          </div>
        ))}

        <div data-budget-chart className="pointer-events-none absolute inset-0">
          {hover && (
            <div
              className="absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-sm"
              style={{ left: hover.x }}
            >
              <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hover.slice.color }} />
                {hover.slice.label}
              </p>
              <p className="text-muted-foreground">
                Budget <span className="font-medium text-foreground">{formatPeso(hover.slice.budget)}</span>
                {totalBudget > 0 && ` · ${Math.round((hover.slice.budget / totalBudget) * 100)}% of total`}
              </p>
              <p className="text-muted-foreground">
                Spent <span className="font-medium text-foreground">{formatPeso(hover.slice.spent)}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Legend doubles as the table view: identity never rests on color alone. */}
      <table className="mt-5 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2 font-normal">Category</th>
            <th className="pb-2 text-right font-normal">Budget</th>
            <th className="pb-2 text-right font-normal">Share</th>
            <th className="pb-2 text-right font-normal">Spent</th>
            <th className="pb-2 text-right font-normal">Left</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {slices.map((s) => {
            const left = s.budget - s.spent;
            const over = s.budget > 0 && s.spent > s.budget;
            const noBudget = s.budget === 0;
            return (
              <tr
                key={s.category}
                className={cn("transition-colors", hover?.slice.category === s.category && "bg-accent")}
                onMouseEnter={() => setHover((h) => (h ? { ...h, slice: s } : null))}
              >
                <td className="py-2">
                  <span className="flex items-center gap-2 text-foreground">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums text-foreground">{formatPeso(s.budget)}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {Math.round((s.budget / totalBudget) * 100)}%
                </td>
                <td className="py-2 text-right tabular-nums text-foreground">{formatPeso(s.spent)}</td>
                <td className="py-2 text-right tabular-nums">
                  {noBudget ? (
                    <span className="inline-flex items-center gap-1 text-[var(--status-warning)]">
                      <AlertTriangle className="h-3 w-3" /> No budget
                    </span>
                  ) : over ? (
                    <span className="inline-flex items-center gap-1 font-medium text-[var(--status-warning)]">
                      <AlertTriangle className="h-3 w-3" /> {formatPeso(-left)} over
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{formatPeso(left)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
