import { createSheetCollection } from "./collection";
import type { RawMaterialStock } from "@/lib/store/types";

const HEADER = ["id", "name", "unit", "qty", "lowStockThreshold", "perBatchQty", "color", "unitCost", "deletedAt"];

function toRow(m: RawMaterialStock): string[] {
  return [
    m.id,
    m.name,
    m.unit,
    String(m.qty),
    String(m.lowStockThreshold),
    m.perBatchQty === null ? "" : String(m.perBatchQty),
    m.color ?? "",
    String(m.unitCost),
    "",
  ];
}

function fromRow(row: string[]): RawMaterialStock | null {
  const [id, name, unit, qty, lowStockThreshold, perBatchQty, color, unitCost] = row;
  if (!id) return null;
  return {
    id,
    name,
    unit,
    qty: Number(qty) || 0,
    lowStockThreshold: Number(lowStockThreshold) || 0,
    perBatchQty: perBatchQty ? Number(perBatchQty) : null,
    color: color || null,
    unitCost: Number(unitCost) || 0,
  };
}

export const rawMaterialsCollection = createSheetCollection<RawMaterialStock>({
  sheetName: "Raw Materials",
  header: HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow,
  fromRow,
});
