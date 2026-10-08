import { convertQuantity } from "@/lib/units";
import { rawQuantityNeeded } from "./cacao";
import { valueMaterial } from "./ingredient-cost";
import type {
  Entry,
  Product,
  RawMaterialStock,
  RecipeExtraRow,
  RecipeIngredientRow,
  SupplierPrice,
} from "@/lib/store/types";

/**
 * The one cost chain in the app.
 *
 *   supplier-logged price (₱ for a stated quantity and unit)
 *     -> ingredient cost per unit            getUnitCost
 *       -> recipe cost per jar               getProductCost
 *         -> total cost per jar              (+ packaging + labor + other)
 *
 * Nothing downstream stores a cost. Every figure is derived on read, so logging a new
 * supplier price moves margins on Pricing, Home, Sales and Scheduling at once, with no
 * recalculation step and nowhere for a stale number to hide.
 */

export interface UnitCost {
  /** Cost of one of the material's own unit — a kilo of beans, a single jar. */
  cost: number;
  source: "transactions" | "supplier" | "stored" | "none";
  supplierId: string | null;
  loggedAt: string | null;
}

export interface CostLine {
  materialId: string;
  name: string;
  quantityPerBatch: number;
  unit: string;
  unitCost: number;
  batchCost: number;
  source: UnitCost["source"];
}

export interface ProductCost {
  /** What goes in the jar. */
  ingredientCost: number;
  /** The jar, label, lid. */
  packagingCost: number;
  laborCost: number;
  /** Electricity, gas — anything the owner logged as a misc recipe row. */
  otherCost: number;
  totalCost: number;
  laborIsOverride: boolean;
  ingredientLines: CostLine[];
  packagingLines: CostLine[];
  /** Materials whose supplier price is logged in a unit that can't convert to theirs. */
  unconvertible: string[];
}

function sumExtras(rows: RecipeExtraRow[]): number {
  return rows.reduce((total, row) => total + row.cost, 0);
}

function isPackaging(material: RawMaterialStock): boolean {
  if (material.kind) return material.kind === "packaging";
  // Rows predating the kind column fall back to their name. Wrong guesses are visible and
  // one edit away; refusing to classify would leave the breakdown blank for every product.
  return /jar|label|lid|box|pack|wrap|sachet|tray|bottle|cap|seal|sticker/i.test(material.name);
}

/**
 * What one unit of an ingredient costs.
 *
 * In order of how much the number can be trusted:
 *
 *  1. HER EXPENSES. Money that actually left the account, FIFO-drawn against what production
 *     has eaten and averaged over what is left (see ingredient-cost.ts). This is the source
 *     of truth, because it is the only one that cannot quietly go stale.
 *  2. A supplier price she logged. Real, but maintained by hand, so it is only as current as
 *     the last time she remembered.
 *  3. The material's stored unitCost. A typed-in guess; it keeps a fresh install from costing
 *     everything at zero and nothing more than that.
 *
 * Expenses used to come LAST — in fact they were not in this chain at all, only offered as a
 * suggestion to copy into one of the other two. So the price of a jar moved when she did
 * bookkeeping rather than when beans got dearer.
 */
export function getUnitCost(
  materialId: string,
  rawMaterials: RawMaterialStock[],
  supplierPrices: SupplierPrice[],
  /** Her ledger. Omitted only by callers that genuinely have no entries to hand. */
  entries: Entry[] = [],
  products: Product[] = [],
  cacaoUtilization = 1,
): UnitCost {
  const material = rawMaterials.find((m) => m.id === materialId);
  if (!material) return { cost: 0, source: "none", supplierId: null, loggedAt: null };

  if (entries.length > 0) {
    const valued = valueMaterial(entries, products, material, cacaoUtilization);
    if (valued.unitCost !== null && valued.unitCost > 0) {
      return {
        cost: valued.unitCost,
        source: "transactions",
        supplierId: null,
        loggedAt: valued.layers[valued.layers.length - 1]?.date ?? null,
      };
    }
  }

  const priced = supplierPrices
    .filter((p) => p.materialId === materialId && p.quantity > 0)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));

  for (const entry of priced) {
    const quantityInMaterialUnit = convertQuantity(entry.quantity, entry.unit, material.unit);
    if (quantityInMaterialUnit === null || quantityInMaterialUnit <= 0) continue; // unusable unit
    return {
      cost: entry.price / quantityInMaterialUnit,
      source: "supplier",
      supplierId: entry.supplierId,
      loggedAt: entry.loggedAt,
    };
  }

  return { cost: material.unitCost, source: "stored", supplierId: null, loggedAt: null };
}

/** Cost of one recipe row at the material's current unit cost. */
export function ingredientRowCost(
  row: RecipeIngredientRow,
  rawMaterials: RawMaterialStock[],
  supplierPrices: SupplierPrice[],
  entries: Entry[] = [],
  products: Product[] = [],
  cacaoUtilization = 1,
): number {
  return (
    getUnitCost(row.materialId, rawMaterials, supplierPrices, entries, products, cacaoUtilization).cost * row.quantity
  );
}

/**
 * Labor for one batch: minutes on the clock at the hourly rate, unless the owner typed a
 * figure in directly, in which case theirs stands.
 */
export function batchLaborCost(product: Product, hourlyLaborRate: number): { cost: number; isOverride: boolean } {
  if (product.laborCostOverride != null) return { cost: product.laborCostOverride, isOverride: true };
  const minutes = product.minutesPerBatch ?? 0;
  return { cost: (minutes / 60) * hourlyLaborRate, isOverride: false };
}

/**
 * Everything one jar costs to make, split into lines that sum to the total.
 *
 * Packaging and labor are broken out rather than added on: jars, labels and labor were
 * always inside this figure, just folded into one "ingredients" number that made ₱15 of
 * packaging per jar invisible. The total is unchanged by the split.
 */
export function getProductCost(
  product: Product,
  rawMaterials: RawMaterialStock[],
  supplierPrices: SupplierPrice[],
  hourlyLaborRate: number,
  /** Share of raw cacao that's usable, 0–1. Recipes are written in usable cacao. */
  cacaoUtilization = 1,
  /** Her ledger, so ingredient prices come from receipts rather than a stored guess. */
  entries: Entry[] = [],
  products: Product[] = [],
): ProductCost {
  const ingredientLines: CostLine[] = [];
  const packagingLines: CostLine[] = [];
  const unconvertible: string[] = [];

  for (const row of product.recipeIngredients) {
    const material = rawMaterials.find((m) => m.id === row.materialId);
    if (!material) continue;
    const unitCost = getUnitCost(row.materialId, rawMaterials, supplierPrices, entries, products, cacaoUtilization);
    // Raw quantity actually bought — more than the recipe's usable amount for cacao.
    const rawQty = rawQuantityNeeded(material.name, row.quantity, cacaoUtilization);
    const line: CostLine = {
      materialId: row.materialId,
      name: material.name,
      quantityPerBatch: rawQty,
      unit: material.unit,
      unitCost: unitCost.cost,
      batchCost: unitCost.cost * rawQty,
      source: unitCost.source,
    };
    (isPackaging(material) ? packagingLines : ingredientLines).push(line);

    const hasUnusablePrice = supplierPrices.some(
      (p) => p.materialId === row.materialId && convertQuantity(p.quantity, p.unit, material.unit) === null,
    );
    if (hasUnusablePrice && unitCost.source !== "supplier") unconvertible.push(material.name);
  }

  const labor = batchLaborCost(product, hourlyLaborRate);
  const yieldQty = product.batchYield;
  const perJar = (batchTotal: number) => (yieldQty > 0 ? batchTotal / yieldQty : 0);

  const ingredientCost = perJar(ingredientLines.reduce((sum, l) => sum + l.batchCost, 0));
  const packagingCost = perJar(packagingLines.reduce((sum, l) => sum + l.batchCost, 0));
  const laborCost = perJar(labor.cost);
  const otherCost = perJar(sumExtras(product.recipeMisc));

  return {
    ingredientCost,
    packagingCost,
    laborCost,
    otherCost,
    totalCost: ingredientCost + packagingCost + laborCost + otherCost,
    laborIsOverride: labor.isOverride,
    ingredientLines,
    packagingLines,
    unconvertible,
  };
}
