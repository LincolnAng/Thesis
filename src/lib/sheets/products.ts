import { createSheetCollection } from "./collection";
import type { ProductRow, RecipeRow } from "@/lib/store/sheet-shapes";

export type { ProductRow, RecipeRow };

// "competitive" is deliberately absent: a row still saying it is read as self pricing.
const PRICING_MODES = ["manual", "cost_percent", "margin"];

// marketPrice is appended strictly after deletedAt (not just after the other
// price fields) so every column already written for existing rows — including
// deletedAt's own position — stays exactly where it was; only a genuinely new
// trailing column is added, which old rows simply read back as empty/0.
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
  "marketPrice",
  "minutesPerBatch",
  "laborCostOverride",
  "unit",
  // Appended after unit, for the same reason as every other addition here.
  "sizeLabel",
  "sizeOfId",
  "bulkSize",
  "bulkWord",
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
    String(p.marketPrice),
    p.minutesPerBatch == null ? "" : String(p.minutesPerBatch),
    p.laborCostOverride == null ? "" : String(p.laborCostOverride),
    p.unit ?? "",
    p.sizeLabel ?? "",
    p.sizeOfId ?? "",
    p.bulkSize == null ? "" : String(p.bulkSize),
    p.bulkWord ?? "",
  ];
}

function productFromRow(row: string[]): ProductRow | null {
  const [
    id,
    name,
    standardPrice,
    pricingMode,
    marginPercent,
    friendPrice,
    wholesalePrice,
    stockQty,
    lowStockThreshold,
    batchYield,
    ,
    marketPrice,
    minutesPerBatch,
    laborCostOverride,
    unit,
    sizeLabel,
    sizeOfId,
    bulkSize,
    bulkWord,
  ] = row;
  if (!id) return null;
  return {
    id,
    name,
    standardPrice:
      pricingMode === "competitive" ? Number(marketPrice) || Number(standardPrice) || 0 : Number(standardPrice) || 0,
    // Anything unrecognized (e.g. the retired "suggested") falls back to self pricing, and so
    // does "competitive" — the market-based mode is gone, and a product priced that way keeps
    // charging exactly what it charged, now as a typed price (see standardPrice below).
    pricingMode: (PRICING_MODES as string[]).includes(pricingMode) ? (pricingMode as ProductRow["pricingMode"]) : "manual",
    marginPercent: Number(marginPercent) || 0,
    friendPrice: Number(friendPrice) || 0,
    wholesalePrice: Number(wholesalePrice) || 0,
    stockQty: Number(stockQty) || 0,
    lowStockThreshold: Number(lowStockThreshold) || 0,
    batchYield: Number(batchYield) || 0,
    marketPrice: Number(marketPrice) || 0,
    minutesPerBatch: minutesPerBatch ? Number(minutesPerBatch) : undefined,
    // Empty means "no override" — distinct from an override of zero, which is a real
    // answer (a product that costs no labor) and must survive a round trip.
    laborCostOverride: laborCostOverride === "" || laborCostOverride === undefined ? null : Number(laborCostOverride),
    unit: unit || undefined,
    sizeLabel: sizeLabel || null,
    sizeOfId: sizeOfId || null,
    bulkSize: bulkSize ? Number(bulkSize) || null : null,
    bulkWord: bulkWord || null,
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
