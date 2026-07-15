import { createSheetCollection } from "./collection";
import type { ProductRow, RecipeRow } from "@/lib/store/sheet-shapes";

export type { ProductRow, RecipeRow };

const PRODUCT_HEADER = [
  "id",
  "name",
  "standardPrice",
  "pricingMode",
  "marginPercent",
  "friendPrice",
  "wholesalePrice",
  "stockQty",
  "lowStockThreshold",
  "batchYield",
  "deletedAt",
];

function productToRow(p: ProductRow): string[] {
  return [
    p.id,
    p.name,
    String(p.standardPrice),
    p.pricingMode,
    String(p.marginPercent),
    String(p.friendPrice),
    String(p.wholesalePrice),
    String(p.stockQty),
    String(p.lowStockThreshold),
    String(p.batchYield),
    "",
  ];
}

function productFromRow(row: string[]): ProductRow | null {
  const [id, name, standardPrice, pricingMode, marginPercent, friendPrice, wholesalePrice, stockQty, lowStockThreshold, batchYield] =
    row;
  if (!id) return null;
  return {
    id,
    name,
    standardPrice: Number(standardPrice) || 0,
    pricingMode: pricingMode as ProductRow["pricingMode"],
    marginPercent: Number(marginPercent) || 0,
    friendPrice: Number(friendPrice) || 0,
    wholesalePrice: Number(wholesalePrice) || 0,
    stockQty: Number(stockQty) || 0,
    lowStockThreshold: Number(lowStockThreshold) || 0,
    batchYield: Number(batchYield) || 0,
  };
}

export const productsCollection = createSheetCollection<ProductRow>({
  sheetName: "Products",
  header: PRODUCT_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: productToRow,
  fromRow: productFromRow,
});

const RECIPE_HEADER = ["id", "productId", "rowType", "materialId", "label", "quantity", "cost", "deletedAt"];

function recipeToRow(r: RecipeRow): string[] {
  return [
    r.id,
    r.productId,
    r.rowType,
    r.materialId ?? "",
    r.label ?? "",
    r.quantity === null ? "" : String(r.quantity),
    r.cost === null ? "" : String(r.cost),
    "",
  ];
}

function recipeFromRow(row: string[]): RecipeRow | null {
  const [id, productId, rowType, materialId, label, quantity, cost] = row;
  if (!id) return null;
  return {
    id,
    productId,
    rowType: rowType as RecipeRow["rowType"],
    materialId: materialId || null,
    label: label || null,
    quantity: quantity ? Number(quantity) : null,
    cost: cost ? Number(cost) : null,
  };
}

export const recipesCollection = createSheetCollection<RecipeRow>({
  sheetName: "Recipes",
  header: RECIPE_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: recipeToRow,
  fromRow: recipeFromRow,
});
