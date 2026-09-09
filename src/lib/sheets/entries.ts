import { createSheetCollection } from "./collection";
import type { Entry } from "@/lib/store/types";

const HEADER = [
  "id",
  "timestamp",
  "type",
  "amount",
  "quantity",
  "unit",
  "sku",
  "counterparty",
  "location",
  "priceType",
  "category",
  "rawText",
  "confidence",
  "notes",
  "deletedAt",
];

function toRow(e: Entry): string[] {
  return [
    e.id,
    e.timestamp,
    e.type,
    e.amount === null ? "" : String(e.amount),
    e.quantity === null ? "" : String(e.quantity),
    e.unit ?? "",
    e.sku ?? "",
    e.counterparty ?? "",
    e.location ?? "",
    e.priceType ?? "",
    e.category ?? "",
    e.rawText,
    String(e.confidence),
    e.notes ?? "",
    "", // deletedAt — append/update always write the live (non-deleted) state
  ];
}

function fromRow(row: string[]): Entry | null {
  const [id, timestamp, type, amount, quantity, unit, sku, counterparty, location, priceType, category, rawText, confidence, notes] =
    row;
  if (!id) return null;
  return {
    id,
    timestamp,
    type: type as Entry["type"],
    amount: amount ? Number(amount) : null,
    quantity: quantity ? Number(quantity) : null,
    unit: unit || null,
    sku: sku || null,
    counterparty: counterparty || null,
    location: location || null,
    priceType: (priceType || null) as Entry["priceType"],
    category: (category || null) as Entry["category"],
    rawText: rawText ?? "",
    confidence: confidence ? Number(confidence) : 0,
    notes: notes || null,
  };
}

export const entriesCollection = createSheetCollection<Entry>({
  sheetName: "Transactions",
  header: HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow,
  fromRow,
});
