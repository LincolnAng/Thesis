"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { removeCategoryBudget, setCategoryBudget } from "@/lib/store/store";
import { CATEGORY_ORDER, computeExpensesSummary } from "@/lib/summary/expenses-summary";
import { EXPENSE_CATEGORY_LABELS, formatPeso } from "@/lib/format";
import type { ExpenseCategory } from "@/lib/store/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CategoryBudgetEditor() {
  const { entries, categoryBudgets } = useStore();
  const summary = useMemo(() => computeExpensesSummary(entries, categoryBudgets), [entries, categoryBudgets]);
  const [addingCategory, setAddingCategory] = useState<ExpenseCategory | "">("");

  const spentByCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const row of summary.byCategory) map.set(row.category, row.amount);
    return map;
  }, [summary]);

  const activeCategories = CATEGORY_ORDER.filter((c) => categoryBudgets[c] !== undefined);
  const availableToAdd = CATEGORY_ORDER.filter((c) => categoryBudgets[c] === undefined);

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      <div>
        <p className="text-sm font-semibold text-foreground">Monthly budget by category</p>
        <p className="text-xs text-muted-foreground">
          Set how much you plan to spend in each category this month. Only categories listed here are tracked
          against a budget.
        </p>
      </div>

      {activeCategories.length === 0 ? (
        <p className="text-xs text-muted-foreground">No categories being tracked yet — add one below.</p>
      ) : (
        <div className="space-y-2">
          {activeCategories.map((category) => {
            const budget = categoryBudgets[category] ?? 0;
            const spent = spentByCategory.get(category) ?? 0;
            const overBudget = budget > 0 && spent > budget;
            const withinBudget = budget > 0 && spent <= budget;
            return (
              <div key={category} className="space-y-2 rounded-xl border border-border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {EXPENSE_CATEGORY_LABELS[category] ?? category}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    aria-label={`Stop tracking ${EXPENSE_CATEGORY_LABELS[category] ?? category}`}
                    onClick={() => removeCategoryBudget(category)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">₱</span>
                  <Input
                    type="number"
                    className="h-8 flex-1"
                    value={budget}
                    onChange={(e) => setCategoryBudget(category, Number(e.target.value) || 0)}
                    placeholder="Monthly budget"
                  />
                  <span className="text-xs text-muted-foreground">per month</span>
                </div>
                <p
                  className={cn(
                    "flex items-center gap-1 text-xs",
                    overBudget ? "font-semibold text-[var(--status-warning)]" : "text-muted-foreground",
                    withinBudget && "text-[var(--status-good)]",
                  )}
                >
                  {overBudget && <AlertTriangle className="h-3 w-3 shrink-0" />}
                  {formatPeso(spent)} spent so far
                  {budget > 0 && (overBudget ? " — over this budget" : " — within budget")}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {availableToAdd.length > 0 && (
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <select
            value={addingCategory}
            onChange={(e) => setAddingCategory(e.target.value as ExpenseCategory | "")}
            className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Track a category…</option>
            {availableToAdd.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1"
            disabled={!addingCategory}
            onClick={() => {
              if (!addingCategory) return;
              setCategoryBudget(addingCategory, 0);
              setAddingCategory("");
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}
