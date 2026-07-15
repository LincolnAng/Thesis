import { createSheetCollection } from "./collection";
import type { SupplierPriceHistoryRow, SupplierRow } from "@/lib/store/sheet-shapes";

export type { SupplierRow, SupplierPriceHistoryRow };

const SUPPLIER_HEADER = ["id", "name", "type", "items", "lastPrice", "contact", "deletedAt"];

function supplierToRow(s: SupplierRow): string[] {
  return [s.id, s.name, s.type, s.items, String(s.lastPrice), s.contact, ""];
}

function supplierFromRow(row: string[]): SupplierRow | null {
  const [id, name, type, items, lastPrice, contact] = row;
  if (!id) return null;
  return { id, name, type: type as SupplierRow["type"], items, lastPrice: Number(lastPrice) || 0, contact };
}

export const suppliersCollection = createSheetCollection<SupplierRow>({
  sheetName: "Suppliers",
  header: SUPPLIER_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: supplierToRow,
  fromRow: supplierFromRow,
});

const HISTORY_HEADER = ["id", "supplierId", "date", "price", "deletedAt"];

function historyToRow(h: SupplierPriceHistoryRow): string[] {
  return [h.id, h.supplierId, h.date, String(h.price), ""];
}

function historyFromRow(row: string[]): SupplierPriceHistoryRow | null {
  const [id, supplierId, date, price] = row;
  if (!id) return null;
  return { id, supplierId, date, price: Number(price) || 0 };
}

export const supplierPriceHistoryCollection = createSheetCollection<SupplierPriceHistoryRow>({
  sheetName: "Supplier Price History",
  header: HISTORY_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: historyToRow,
  fromRow: historyFromRow,
});
