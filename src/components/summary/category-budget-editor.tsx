"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { removeCategoryBudget, setCategoryBudget } from "@/lib/store/store";
import { CATEGORY_ORDER, computeExpensesSummary } from "@/lib/summary/expenses-summary";
import { CategoryIcon } from "@/lib/summary/category-icons";
import { EXPENSE_CATEGORY_LABELS, formatPeso } from "@/lib/format";
import type { ExpenseCategory } from "@/lib/store/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import { cn } from "@/lib/utils";

function CategoryBudgetRow({
  category,
  budget,
  spent,
}: {
  category: ExpenseCategory;
  budget: number;
  spent: number;
}) {
  const budgetField = useNumericDraft(budget, (n) => setCategoryBudget(category, n));
  const overBudget = budget > 0 && spent > budget;
  const withinBudget = budget > 0 && spent <= budget;
  const label = EXPENSE_CATEGORY_LABELS[category] ?? category;

  return (
    <div className="space-y-2 rounded-xl border border-border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <CategoryIcon category={category} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {label}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground"
          aria-label={`Stop tracking ${label}`}
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
          value={budgetField.value}
          onChange={(e) => budgetField.onChange(e.target.value)}
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
}

export function CategoryBudgetEditor() {
  const { entries, categoryBudgets } = useStore();
  const summary = useMemo(() => computeExpensesSummary(entries, categoryBudgets), [entries, categoryBudgets]);
  const [addingBuiltIn, setAddingBuiltIn] = useState<ExpenseCategory | "">("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);

  const spentByCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const row of summary.byCategory) map.set(row.category, row.amount);
    return map;
  }, [summary]);

  // Any key present in categoryBudgets is a tracked category — built-in or one the
  // owner created themselves. That object is the whole registry of "categories that
  // exist" now, not just the 6 built-ins.
  const activeCategories = Object.keys(categoryBudgets);
  const availableBuiltIns = CATEGORY_ORDER.filter((c) => categoryBudgets[c] === undefined);

  function createCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const exists = activeCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setNewCategoryError("That category already exists.");
      return;
    }
    setCategoryBudget(trimmed, 0);
    setNewCategoryName("");
    setNewCategoryError(null);
  }

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
          {activeCategories.map((category) => (
            <CategoryBudgetRow
              key={category}
              category={category}
              budget={categoryBudgets[category] ?? 0}
              spent={spentByCategory.get(category) ?? 0}
            />
          ))}
        </div>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-semibold text-muted-foreground">Create a new category</p>
        <div className="flex items-center gap-2">
          <Input
            className="h-8 flex-1"
            value={newCategoryName}
            onChange={(e) => {
              setNewCategoryName(e.target.value);
              setNewCategoryError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && createCategory()}
            placeholder="e.g. Marketing, Delivery…"
          />
          <Button size="sm" variant="secondary" className="gap-1" disabled={!newCategoryName.trim()} onClick={createCategory}>
            <Plus className="h-3.5 w-3.5" /> Create
          </Button>
        </div>
        {newCategoryError && <p className="text-xs text-[var(--status-warning)]">{newCategoryError}</p>}
      </div>

      {availableBuiltIns.length > 0 && (
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <select
            value={addingBuiltIn}
            onChange={(e) => setAddingBuiltIn(e.target.value as ExpenseCategory | "")}
            className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Track a built-in category…</option>
            {availableBuiltIns.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1"
            disabled={!addingBuiltIn}
            onClick={() => {
              if (!addingBuiltIn) return;
              setCategoryBudget(addingBuiltIn, 0);
              setAddingBuiltIn("");
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}
