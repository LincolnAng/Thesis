import { createSheetCollection } from "./collection";
import type { BudgetRow } from "@/lib/store/sheet-shapes";
import type { ExpenseCategory } from "@/lib/store/types";

export type { BudgetRow };

const HEADER = ["category", "monthlyBudget", "deletedAt"];

function toRow(b: BudgetRow): string[] {
  return [b.category, String(b.monthlyBudget), ""];
}

function fromRow(row: string[]): BudgetRow | null {
  const [category, monthlyBudget] = row;
  if (!category) return null;
  return { category: category as ExpenseCategory, monthlyBudget: Number(monthlyBudget) || 0 };
}

export const budgetsCollection = createSheetCollection<BudgetRow>({
  sheetName: "Budgets",
  header: HEADER,
  idColumn: "category",
  deletedColumn: "deletedAt",
  toRow,
  fromRow,
});
