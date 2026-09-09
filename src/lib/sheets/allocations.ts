import { createSheetCollection } from "./collection";
import type { Allocation } from "@/lib/store/types";

const ALLOCATION_HEADER = ["id", "productId", "variantId", "label", "allocatedQty", "eventId", "createdAt", "deletedAt"];

function allocationToRow(a: Allocation): string[] {
  return [a.id, a.productId, a.variantId ?? "", a.label, String(a.allocatedQty), a.eventId ?? "", a.createdAt, ""];
}

function allocationFromRow(row: string[]): Allocation | null {
  const [id, productId, variantId, label, allocatedQty, eventId, createdAt] = row;
  if (!id) return null;
  return {
    id,
    productId,
    variantId: variantId || null,
    label: label ?? "",
    allocatedQty: Number(allocatedQty) || 0,
    eventId: eventId || null,
    createdAt: createdAt ?? new Date().toISOString(),
  };
}

export const allocationsCollection = createSheetCollection<Allocation>({
  sheetName: "Allocations",
  header: ALLOCATION_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: allocationToRow,
  fromRow: allocationFromRow,
});
