import { createSheetCollection } from "./collection";
import type { PriceTier } from "@/lib/store/types";

const PRICE_TIER_HEADER = ["id", "productId", "variantId", "dimensionType", "dimensionValue", "price", "label", "deletedAt"];

function priceTierToRow(t: PriceTier): string[] {
  return [t.id, t.productId, t.variantId ?? "", t.dimensionType, t.dimensionValue, String(t.price), t.label, ""];
}

function priceTierFromRow(row: string[]): PriceTier | null {
  const [id, productId, variantId, dimensionType, dimensionValue, price, label] = row;
  if (!id) return null;
  return {
    id,
    productId,
    variantId: variantId || null,
    dimensionType: dimensionType as PriceTier["dimensionType"],
    dimensionValue: dimensionValue ?? "",
    price: Number(price) || 0,
    label: label ?? "",
  };
}

export const priceTiersCollection = createSheetCollection<PriceTier>({
  sheetName: "Price Tiers",
  header: PRICE_TIER_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: priceTierToRow,
  fromRow: priceTierFromRow,
});
