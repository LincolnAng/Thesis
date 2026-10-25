import { createSheetCollection } from "./collection";
import type { StockTransfer } from "@/lib/store/types";

/** Stock moved between branches (lib/inventory/branches). */
export const stockTransfersCollection = createSheetCollection<StockTransfer>({
  sheetName: "Stock Transfers",
  header: ["id", "productId", "fromBranch", "toBranch", "quantity", "date", "note", "loggedByName", "createdAt", "deletedAt"],
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: (t) => [t.id, t.productId, t.fromBranch, t.toBranch, String(t.quantity), t.date, t.note ?? "", t.loggedByName ?? "", t.createdAt, ""],
  fromRow: ([id, productId, fromBranch, toBranch, quantity, date, note, loggedByName, createdAt]) =>
    id && productId ? { id, productId, fromBranch, toBranch, quantity: Number(quantity) || 0, date: date ?? "", note: note ?? "", loggedByName: loggedByName || null, createdAt: createdAt || "" } : null,
});
