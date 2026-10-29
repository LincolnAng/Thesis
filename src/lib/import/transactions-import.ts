import type { Entry, OrderLine, PaymentMethod, Product } from "@/lib/store/types";
import type { EntryDraft } from "@/lib/home/describe-entry";
import { resolveProduct } from "@/lib/ai/product-resolve";
import { fullName } from "@/lib/summary/product-sizes";
import { describeOrder, orderQuantity } from "@/lib/transactions/order-lines";
import { PAST_RECORD } from "@/lib/import/past-record";

/**
 * Bringing the old spreadsheets in: a CSV with one row per line of the sheet —
 *
 *   date, type (sale | expense | asset), item, quantity, unit, unit_price, amount,
 *   party (customer or store), payment (cash | gcash | bank | cheque), bank, category, note
 *
 * A customer's lines on the same day with the same payment become one order, as the app keeps
 * them. Product names are matched to the products the way BAi matches them; a line that can't be
 * matched is shown so someone picks the product (or it's kept under its own name, moving no
 * stock). Rows already in Transactions — same day, kind, amount and who — are skipped, so the
 * same file can't be brought in twice. Pure (transactions-import.test.ts).
 */

export interface CsvRow {
  date: string;
  type: string;
  item: string;
  quantity: string;
  unit: string;
  unit_price: string;
  amount: string;
  party: string;
  payment: string;
  bank: string;
  category: string;
  note: string;
}

/** Reads CSV text (quotes, commas inside quotes, a byte-order mark) into rows keyed by header. */
export function parseCsv(text: string): CsvRow[] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])) as unknown as CsvRow);
}

export interface ImportLine {
  /** Row number in the file (2 = first row after the header). */
  rowNo: number;
  item: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** The product this sale line is, or null when it couldn't be matched. */
  productId: string | null;
  /** Products it could be, when the name fits several. */
  candidates: string[];
}

export interface ImportItem {
  key: string;
  kind: "SALE" | "EXPENSE" | "ASSET";
  date: string;
  party: string | null;
  method: PaymentMethod | null;
  bank: string | null;
  category: string | null;
  note: string | null;
  lines: ImportLine[];
  amount: number;
  /** Already in Transactions — skipped unless kept by hand. */
  duplicate: boolean;
  /** Something to look at before importing. */
  warnings: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const numOf = (s: string) => {
  const n = Number(String(s).replace(/[₱,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function methodOf(raw: string): PaymentMethod | null {
  const p = raw.trim().toLowerCase();
  if (!p) return null;
  if (/cheque|check|checke/.test(p)) return "check";
  if (/gcash|maya|e-?wallet|paymaya/.test(p)) return "ewallet";
  if (/bank|transfer|bdo|bpi|metrobank|landbank|pnb|security/.test(p)) return "bank_transfer";
  return "cash";
}

const dayKey = (e: Pick<Entry, "timestamp">) => {
  const d = new Date(e.timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function planImport(rows: CsvRow[], products: Product[], existing: Entry[]): ImportItem[] {
  const items: ImportItem[] = [];
  rows.forEach((row, i) => {
    const rowNo = i + 2;
    const type = row.type.trim().toLowerCase();
    const kind: ImportItem["kind"] = type.startsWith("sale") ? "SALE" : type.startsWith("asset") ? "ASSET" : "EXPENSE";
    const date = row.date.trim();
    const quantity = numOf(row.quantity);
    const unitPrice = numOf(row.unit_price);
    const amount = numOf(row.amount) || r2(quantity * unitPrice);
    const party = row.party.trim() || null;
    const method = methodOf(row.payment);
    const warnings: string[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) warnings.push(`Row ${rowNo}: the date "${date}" isn't YYYY-MM-DD.`);
    if (!(amount > 0)) warnings.push(`Row ${rowNo}: no amount.`);
    if (kind === "SALE" && quantity > 0 && unitPrice > 0 && Math.abs(quantity * unitPrice - amount) > 0.5) {
      warnings.push(`Row ${rowNo}: ${quantity} × ${unitPrice} is ${r2(quantity * unitPrice)}, but the total says ${amount}.`);
    }

    let productId: string | null = null;
    let candidates: string[] = [];
    if (kind === "SALE") {
      const r = resolveProduct(products, row.item);
      if (r.kind === "one") productId = r.product.id;
      else if (r.kind === "several") candidates = r.options.map((p) => p.id);
    }
    const line: ImportLine = { rowNo, item: row.item.trim(), quantity, unitPrice: unitPrice || (quantity > 0 ? r2(amount / quantity) : amount), amount, productId, candidates };

    // A customer's lines on one day, paid the same way, are one order.
    const last = items.at(-1);
    if (kind === "SALE" && last && last.kind === "SALE" && last.date === date && (last.party ?? "") === (party ?? "") && last.method === method) {
      last.lines.push(line);
      last.amount = r2(last.amount + amount);
      last.warnings.push(...warnings);
      return;
    }
    items.push({
      key: `imp-${rowNo}`,
      kind,
      date,
      party,
      method,
      bank: row.bank.trim() || (method === "ewallet" ? "GCash" : null),
      category: kind === "EXPENSE" ? row.category.trim() || "misc" : kind === "ASSET" ? row.category.trim() || "equipment" : null,
      note: row.note.trim() || null,
      lines: [line],
      amount,
      duplicate: false,
      warnings,
    });
  });

  // Already recorded: same day, kind and amount, and the same person when one is named.
  for (const it of items) {
    it.duplicate = existing.some(
      (e) => e.type === it.kind && dayKey(e) === it.date && Math.abs((e.amount ?? 0) - it.amount) < 0.01 && (!it.party || (e.counterparty ?? "").toLowerCase() === it.party.toLowerCase()),
    );
  }
  return items;
}

/** The entries to save for one item, as past records (they move no stock). */
export function draftFor(it: ImportItem, products: Product[]): EntryDraft {
  const [y, m, d] = it.date.split("-").map(Number);
  const timestamp = new Date(y, m - 1, d, 12, 0).toISOString();
  const base: EntryDraft = {
    timestamp,
    type: it.kind,
    amount: it.amount,
    quantity: null,
    unit: null,
    sku: null,
    counterparty: it.party,
    location: null,
    priceType: it.kind === "SALE" ? "standard" : null,
    category: it.category,
    rawText: PAST_RECORD,
    confidence: 1,
    notes: it.note,
    paymentTerm: "spot",
    paymentMethod: it.method,
    bankName: it.method === "bank_transfer" || it.method === "check" || it.method === "ewallet" ? it.bank : null,
  };
  if (it.kind !== "SALE") {
    const l = it.lines[0];
    return { ...base, sku: l.item, quantity: l.quantity > 0 ? l.quantity : null, unit: null };
  }
  const lines: OrderLine[] = it.lines.map((l) => {
    const p = l.productId ? products.find((x) => x.id === l.productId) : undefined;
    return { productId: p?.id ?? null, name: p ? fullName(p, products) : l.item, quantity: l.quantity || 1, unitPrice: l.unitPrice };
  });
  return {
    ...base,
    lineItems: lines,
    quantity: orderQuantity(lines),
    sku: lines.length === 1 ? lines[0].name : describeOrder(lines),
    unit: lines.length === 1 ? (products.find((p) => p.id === lines[0].productId)?.unit ?? null) : null,
  };
}
