import { createSheetCollection } from "./collection";
import type { SupplierPrice } from "@/lib/store/types";

const HEADER = ["id", "supplierId", "materialId", "price", "quantity", "unit", "loggedAt", "deletedAt"];

function toRow(p: SupplierPrice): string[] {
  return [p.id, p.supplierId, p.materialId, String(p.price), String(p.quantity), p.unit, p.loggedAt, ""];
}

function fromRow(row: string[]): SupplierPrice | null {
  const [id, supplierId, materialId, price, quantity, unit, loggedAt] = row;
  if (!id || !supplierId || !materialId) return null;
  return {
    id,
    supplierId,
    materialId,
    price: Number(price) || 0,
    quantity: Number(quantity) || 0,
    unit: unit ?? "",
    loggedAt: loggedAt || new Date().toISOString(),
  };
}

export const supplierPricesCollection = createSheetCollection<SupplierPrice>({
  sheetName: "Supplier Prices",
  header: HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow,
  fromRow,
});
