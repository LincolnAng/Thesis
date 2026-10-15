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
  // Appended strictly after deletedAt — inserting a column mid-header would shift every
  // existing row's positional read (see the note in products.ts).
  "eventId",
  // Same rule again: appended after eventId so rows written before this still parse, their
  // empty cells meaning "we were not recording who" rather than "nobody".
  "loggedById",
  "loggedByName",
  // Payment terms, appended last for the same reason. Empty on older rows, which read as spot.
  "paymentTerm",
  "dueDate",
  "amountPaid",
  "paymentStatus",
  "settledAt",
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
    e.eventId ?? "",
    e.loggedById ?? "",
    e.loggedByName ?? "",
    e.paymentTerm ?? "",
    e.dueDate ?? "",
    e.amountPaid == null ? "" : String(e.amountPaid),
    e.paymentStatus ?? "",
    e.settledAt ?? "",
  ];
}

function fromRow(row: string[]): Entry | null {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [id, timestamp, type, amount, quantity, unit, sku, counterparty, location, priceType, category, rawText, confidence, notes, _deletedAt, eventId, loggedById, loggedByName, paymentTerm, dueDate, amountPaid, paymentStatus, settledAt] =
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
    eventId: eventId || null,
    loggedById: loggedById || null,
    loggedByName: loggedByName || null,
    paymentTerm: (["spot", "payable", "receivable"].includes(paymentTerm) ? paymentTerm : null) as Entry["paymentTerm"],
    dueDate: dueDate || null,
    amountPaid: amountPaid ? Number(amountPaid) : null,
    paymentStatus: (["pending", "partial", "settled"].includes(paymentStatus) ? paymentStatus : null) as Entry["paymentStatus"],
    settledAt: settledAt || null,
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
