import { createSheetCollection } from "./collection";
import type { Entry } from "@/lib/store/types";

// customerId is appended strictly after deletedAt (the prior last column) — see the
// same convention documented in products.ts — so every existing row's positional
// read stays intact; old rows just read back customerId as empty/null.
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
  "customerId",
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
    e.customerId ?? "",
  ];
}

function fromRow(row: string[]): Entry | null {
  const [
    id,
    timestamp,
    type,
    amount,
    quantity,
    unit,
    sku,
    counterparty,
    location,
    priceType,
    category,
    rawText,
    confidence,
    notes,
    ,
    customerId,
  ] = row;
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
    customerId: customerId || null,
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
