// Pure data-shaping helpers shared between the client store (src/lib/store/store.ts)
// and the server-only Sheets collection configs (src/lib/sheets/*.ts). This file must
// stay free of any import that pulls in Node built-ins (crypto, etc.) — it's bundled
// into the browser via store.ts.
import type { ExpenseCategory, Product, Supplier } from "./types";

export type ProductRow = Omit<Product, "recipeIngredients" | "recipeLabor" | "recipeMisc">;

export interface RecipeRow {
  id: string;
  productId: string;
  rowType: "ingredient" | "labor" | "misc";
  materialId: string | null;
  label: string | null;
  quantity: number | null;
  cost: number | null;
}

/** Flattens one product's nested recipe arrays into child rows for the Recipes tab. */
export function flattenProductRecipe(product: Product): RecipeRow[] {
  const ingredientRows: RecipeRow[] = product.recipeIngredients.map((row) => ({
    id: row.id,
    productId: product.id,
    rowType: "ingredient",
    materialId: row.materialId,
    label: null,
    quantity: row.quantity,
    cost: null,
  }));
  const laborRows: RecipeRow[] = product.recipeLabor.map((row) => ({
    id: row.id,
    productId: product.id,
    rowType: "labor",
    materialId: null,
    label: row.label,
    quantity: null,
    cost: row.cost,
  }));
  const miscRows: RecipeRow[] = product.recipeMisc.map((row) => ({
    id: row.id,
    productId: product.id,
    rowType: "misc",
    materialId: null,
    label: row.label,
    quantity: null,
    cost: row.cost,
  }));
  return [...ingredientRows, ...laborRows, ...miscRows];
}

/** Re-nests a flat ProductRow + its matching RecipeRows back into a full `Product`. */
export function assembleProduct(productRow: ProductRow, recipeRows: RecipeRow[]): Product {
  const forThisProduct = recipeRows.filter((r) => r.productId === productRow.id);
  return {
    ...productRow,
    recipeIngredients: forThisProduct
      .filter((r) => r.rowType === "ingredient")
      .map((r) => ({ id: r.id, materialId: r.materialId ?? "", quantity: r.quantity ?? 0 })),
    recipeLabor: forThisProduct
      .filter((r) => r.rowType === "labor")
      .map((r) => ({ id: r.id, label: r.label ?? "", cost: r.cost ?? 0 })),
    recipeMisc: forThisProduct
      .filter((r) => r.rowType === "misc")
      .map((r) => ({ id: r.id, label: r.label ?? "", cost: r.cost ?? 0 })),
  };
}

export type SupplierRow = Omit<Supplier, "priceHistory">;

export interface SupplierPriceHistoryRow {
  id: string;
  supplierId: string;
  date: string;
  price: number;
}

/** Re-nests a flat SupplierRow + its matching price-history rows back into a full `Supplier`. */
export function assembleSupplier(supplierRow: SupplierRow, historyRows: SupplierPriceHistoryRow[]): Supplier {
  const priceHistory = historyRows
    .filter((h) => h.supplierId === supplierRow.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((h) => ({ date: h.date, price: h.price }));
  return { ...supplierRow, priceHistory };
}

export interface BudgetRow {
  category: ExpenseCategory;
  monthlyBudget: number;
}

export function budgetRowsToRecord(rows: BudgetRow[]): Partial<Record<ExpenseCategory, number>> {
  const record: Partial<Record<ExpenseCategory, number>> = {};
  for (const row of rows) record[row.category] = row.monthlyBudget;
  return record;
}

export function recordToBudgetRows(record: Partial<Record<ExpenseCategory, number>>): BudgetRow[] {
  return (Object.entries(record) as [ExpenseCategory, number][]).map(([category, monthlyBudget]) => ({
    category,
    monthlyBudget,
  }));
}
