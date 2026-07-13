import type { Product, RawMaterialStock, RecipeExtraRow, RecipeIngredientRow } from "@/lib/store/types";

export interface ProductCostBreakdown {
  ingredientTotal: number; // per batch
  laborTotal: number; // per batch
  miscTotal: number; // per batch
  batchTotal: number;
  ingredientPerJar: number;
  laborPerJar: number;
  miscPerJar: number;
  costPerJar: number;
}

function sumExtras(rows: RecipeExtraRow[]): number {
  return rows.reduce((total, row) => total + row.cost, 0);
}

/** Cost of a single recipe row (quantity × the linked material's current unit cost). */
export function ingredientRowCost(row: RecipeIngredientRow, rawMaterials: RawMaterialStock[]): number {
  const material = rawMaterials.find((m) => m.id === row.materialId);
  return material ? row.quantity * material.unitCost : 0;
}

export function ingredientBatchTotal(rows: RecipeIngredientRow[], rawMaterials: RawMaterialStock[]): number {
  return rows.reduce((total, row) => total + ingredientRowCost(row, rawMaterials), 0);
}

/**
 * Cost per jar is always computed live from current ingredient costs and the
 * recipe — never cached on the product — so it can't go stale when an
 * ingredient's price changes.
 */
export function productCostPerJar(product: Product, rawMaterials: RawMaterialStock[]): ProductCostBreakdown {
  const ingredientTotal = ingredientBatchTotal(product.recipeIngredients, rawMaterials);
  const laborTotal = sumExtras(product.recipeLabor);
  const miscTotal = sumExtras(product.recipeMisc);
  const batchTotal = ingredientTotal + laborTotal + miscTotal;
  const yieldQty = product.batchYield;

  return {
    ingredientTotal,
    laborTotal,
    miscTotal,
    batchTotal,
    ingredientPerJar: yieldQty > 0 ? ingredientTotal / yieldQty : 0,
    laborPerJar: yieldQty > 0 ? laborTotal / yieldQty : 0,
    miscPerJar: yieldQty > 0 ? miscTotal / yieldQty : 0,
    costPerJar: yieldQty > 0 ? batchTotal / yieldQty : 0,
  };
}
