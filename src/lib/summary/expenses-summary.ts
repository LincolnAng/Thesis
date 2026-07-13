import { EXPENSE_CATEGORY_LABELS } from "@/lib/format";
import { chipColor } from "@/lib/chart-colors";
import type { Entry, ExpenseCategory } from "@/lib/store/types";
import { entriesInMonth, pctChange, sortByDateDesc, sum } from "./period";
import { monthlyTrend, type TrendPoint } from "./trend";

export interface ExpenseCategoryRow {
  category: ExpenseCategory;
  label: string;
  amount: number;
  pctOfTotal: number;
  barPct: number;
  color: string;
  budget: number;
  overBudget: boolean;
}

export interface ExpensesSummary {
  total: number;
  changePct: number | null;
  budget: number;
  remaining: number;
  byCategory: ExpenseCategoryRow[];
  recent: Entry[];
  trend: TrendPoint[];
}

// Fixed order so a category always gets the same color, everywhere.
export const CATEGORY_ORDER: ExpenseCategory[] = ["raw_materials", "labor", "utilities", "packaging", "transport", "misc"];

export function expenseCategoryColor(category: ExpenseCategory): string {
  return chipColor(CATEGORY_ORDER.indexOf(category));
}

export function computeExpensesSummary(
  entries: Entry[],
  categoryBudgets: Partial<Record<ExpenseCategory, number>>,
): ExpensesSummary {
  const thisMonth = entriesInMonth(entries, 0).filter((e) => e.type === "EXPENSE");
  const lastMonth = entriesInMonth(entries, 1).filter((e) => e.type === "EXPENSE");

  const total = sum(thisMonth, (e) => e.amount ?? 0);
  const lastTotal = sum(lastMonth, (e) => e.amount ?? 0);
  const totalBudget = sum(CATEGORY_ORDER, (c) => categoryBudgets[c] ?? 0);

  const byCategoryMap = new Map<ExpenseCategory, number>();
  for (const e of thisMonth) {
    const key = (e.category ?? "misc") as ExpenseCategory;
    byCategoryMap.set(key, (byCategoryMap.get(key) ?? 0) + (e.amount ?? 0));
  }
  const sorted = Array.from(byCategoryMap.entries()).sort((a, b) => b[1] - a[1]);
  const maxAmount = sorted[0]?.[1] ?? 0;
  const byCategory: ExpenseCategoryRow[] = sorted.map(([category, amount]) => {
    const budget = categoryBudgets[category] ?? 0;
    return {
      category,
      label: EXPENSE_CATEGORY_LABELS[category] ?? category,
      amount,
      pctOfTotal: total > 0 ? Math.round((amount / total) * 100) : 0,
      barPct: maxAmount > 0 ? (amount / maxAmount) * 100 : 0,
      color: expenseCategoryColor(category),
      budget,
      overBudget: budget > 0 && amount > budget,
    };
  });

  const recent = sortByDateDesc(thisMonth).slice(0, 3);
  const trend = monthlyTrend(entries, "EXPENSE");

  return {
    total,
    changePct: pctChange(total, lastTotal),
    budget: totalBudget,
    remaining: totalBudget - total,
    byCategory,
    recent,
    trend,
  };
}

export interface MonthlyCategoryPoint {
  label: string;
  total: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
}

/** Monthly expense totals broken down by category, oldest to newest, ending this month. */
export function monthlyExpensesByCategory(
  entries: Entry[],
  months = 6,
  now: Date = new Date(),
): MonthlyCategoryPoint[] {
  const points: MonthlyCategoryPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthEntries = entriesInMonth(entries, i, now).filter((e) => e.type === "EXPENSE");
    const byCategory: Partial<Record<ExpenseCategory, number>> = {};
    for (const category of CATEGORY_ORDER) {
      const amount = sum(
        monthEntries.filter((e) => (e.category ?? "misc") === category),
        (e) => e.amount ?? 0,
      );
      if (amount > 0) byCategory[category] = amount;
    }
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    points.push({
      label: d.toLocaleDateString("en-PH", { month: "short" }),
      total: sum(monthEntries, (e) => e.amount ?? 0),
      byCategory,
    });
  }
  return points;
}
