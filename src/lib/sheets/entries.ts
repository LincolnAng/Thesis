import { createSheetCollection } from "./collection";
import type { DueDateChange, Entry, InstallmentPlan, PaymentRecord } from "@/lib/store/types";

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
  // Multi-product orders, payment method and dated payments — appended last, as always.
  // lineItems and payments are JSON lists; a cell holds one order's products or payments.
  "lineItems",
  "paymentMethod",
  "bankName",
  "payments",
  // Credit terms, deadline changes and confirmed default — appended last, as always.
  // dueDateHistory is a JSON list of every time the deadline moved.
  "paymentTerms",
  "dueDateHistory",
  "defaultedAt",
  // Instalment plans, and the branch it happened at.
  "installments",
  "branch",
  // A batch's lot, expiry, the packaging it used and whether it was repacked tingi.
  "lotId",
  "expiresOn",
  "packagingUsed",
  "fromTingi",
];

function json<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Payments saved before they had ids and notes get them on the way in, so every reader sees one shape. */
function normalizePayments(entryId: string, list: Partial<PaymentRecord>[] | null): PaymentRecord[] | null {
  if (!list?.length) return null;
  return list.map((p, i) => ({
    id: p.id ?? `pay-${entryId.slice(-6)}-${i + 1}`,
    date: p.date ?? "",
    amount: Number(p.amount) || 0,
    method: p.method ?? null,
    bankName: p.bankName ?? null,
    note: p.note ?? null,
    recordedById: p.recordedById ?? null,
    recordedByName: p.recordedByName ?? null,
  }));
}

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
    e.lineItems?.length ? JSON.stringify(e.lineItems) : "",
    e.paymentMethod ?? "",
    e.bankName ?? "",
    e.payments?.length ? JSON.stringify(e.payments) : "",
    e.paymentTerms ?? "",
    e.dueDateHistory?.length ? JSON.stringify(e.dueDateHistory) : "",
    e.defaultedAt ?? "",
    e.installments ? JSON.stringify(e.installments) : "",
    e.branch ?? "",
    e.lotId ?? "",
    e.expiresOn ?? "",
    e.packagingUsed ? JSON.stringify(e.packagingUsed) : "",
    e.fromTingi ? "yes" : "",
  ];
}

function fromRow(row: string[]): Entry | null {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [id, timestamp, type, amount, quantity, unit, sku, counterparty, location, priceType, category, rawText, confidence, notes, _deletedAt, eventId, loggedById, loggedByName, paymentTerm, dueDate, amountPaid, paymentStatus, settledAt, lineItems, paymentMethod, bankName, payments, paymentTerms, dueDateHistory, defaultedAt, installments, branch, lotId, expiresOn, packagingUsed, fromTingi] =
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
    paymentStatus: (["pending", "partial", "settled", "defaulted"].includes(paymentStatus) ? paymentStatus : null) as Entry["paymentStatus"],
    settledAt: settledAt || null,
    lineItems: json<Entry["lineItems"]>(lineItems),
    paymentMethod: (["cash", "bank_transfer", "ewallet", "check"].includes(paymentMethod) ? paymentMethod : null) as Entry["paymentMethod"],
    bankName: bankName || null,
    payments: normalizePayments(id, json<Partial<PaymentRecord>[]>(payments)),
    paymentTerms: paymentTerms || null,
    dueDateHistory: json<DueDateChange[]>(dueDateHistory),
    defaultedAt: defaultedAt || null,
    installments: json<InstallmentPlan>(installments),
    branch: branch || null,
    lotId: lotId || null,
    expiresOn: expiresOn || null,
    packagingUsed: json<{ materialId: string; qty: number }[]>(packagingUsed),
    fromTingi: fromTingi === "yes" || null,
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
