import type { Entry, Product } from "@/lib/store/types";
import { expandOrderLines } from "@/lib/transactions/order-lines";
import { cashMovements, dayOf, methodOf, obligationKind, outstanding } from "@/lib/transactions/ledger";
import { isMaterialWaste } from "@/lib/transactions/waste";
import { findProduct } from "@/lib/summary/product-match";
import { fullName } from "@/lib/summary/product-sizes";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/format";

/**
 * The sales and expense report the Transactions tab downloads: an executive summary on top
 * (what came in, what went out, what was earned, against the month before), then whichever parts
 * were ticked — sales by product, expenses by category, spoilage, waste — and, if asked, every
 * entry. Pure: it only arranges the records it's given (pdf.ts and csv.ts lay it out).
 */

export type ReportPart = "sales" | "expenses" | "spoilage" | "waste";
export const REPORT_PARTS: { part: ReportPart; label: string }[] = [
  { part: "sales", label: "Sales" },
  { part: "expenses", label: "Expenses" },
  { part: "spoilage", label: "Spoilage (products)" },
  { part: "waste", label: "Waste (raw materials & packaging)" },
];

export interface ReportOptions {
  /** "YYYY-MM-DD", inclusive. */
  from: string;
  to: string;
  label: string;
  parts: ReportPart[];
  /** List every entry, not just the summaries. */
  detail: boolean;
  /** Payment terms and what's owed — Executives only. */
  showOwed: boolean;
}

export interface Table {
  title: string;
  head: string[];
  rows: (string | number)[][];
  /** A bold last row. */
  total?: (string | number)[];
  /** Columns holding pesos, right-aligned. */
  money?: number[];
}

export interface SalesReport {
  title: string;
  subtitle: string;
  summary: { label: string; value: number; note?: string }[];
  summaryTitle: string;
  highlights: string[];
  tables: Table[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = <T,>(list: T[], f: (x: T) => number) => r2(list.reduce((n, x) => n + f(x), 0));
const inRange = (day: string, o: { from: string; to: string }) => day >= o.from && day <= o.to;

function previous(o: ReportOptions): { from: string; to: string } {
  const [y, m, d] = o.from.split("-").map(Number);
  const [y2, m2, d2] = o.to.split("-").map(Number);
  const span = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y, m - 1, d)) / 86_400_000) + 1;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const end = Date.UTC(y, m - 1, d) - 86_400_000;
  return { from: iso(end - (span - 1) * 86_400_000), to: iso(end) };
}

const methodText = (e: Entry) => {
  const { method, bank } = methodOf(e);
  if (!method) return "";
  const name = method === "bank_transfer" ? "Bank transfer" : method === "ewallet" ? "E-wallet" : method === "check" ? "Cheque" : "Cash";
  return bank ? `${name} · ${bank}` : name;
};

export function buildSalesReport(entries: Entry[], products: Product[], o: ReportOptions): SalesReport {
  const within = entries.filter((e) => inRange(dayOf(e.timestamp), o));
  const sales = within.filter((e) => e.type === "SALE");
  const expenses = within.filter((e) => e.type === "EXPENSE");
  const spoilage = within.filter((e) => e.type === "WASTE" && !isMaterialWaste(e));
  const waste = within.filter(isMaterialWaste);

  // Money that actually changed hands in the period — payments on credit count when paid.
  const moves = cashMovements(entries).filter((m) => inRange(m.date, o));
  const moneyIn = sum(moves.filter((m) => m.direction === "in"), (m) => m.amount);
  const moneyOut = sum(moves.filter((m) => m.direction === "out"), (m) => m.amount);
  const salesTotal = sum(sales, (e) => e.amount ?? 0);
  const expenseTotal = sum(expenses, (e) => e.amount ?? 0);
  const spoiled = sum(spoilage, (e) => e.amount ?? 0);
  const wasted = sum(waste, (e) => e.amount ?? 0);

  const prev = previous(o);
  const prevSales = sum(entries.filter((e) => e.type === "SALE" && inRange(dayOf(e.timestamp), prev)), (e) => e.amount ?? 0);

  // Per product: units and revenue, best seller first.
  const byProduct = new Map<string, { name: string; units: number; revenue: number; orders: number }>();
  for (const line of expandOrderLines(sales)) {
    const p = findProduct(products, line.sku);
    const name = p ? fullName(p, products) : (line.sku ?? "Unnamed");
    const cur = byProduct.get(name) ?? { name, units: 0, revenue: 0, orders: 0 };
    cur.units += line.quantity ?? 0;
    cur.revenue = r2(cur.revenue + (line.amount ?? 0));
    cur.orders += 1;
    byProduct.set(name, cur);
  }
  const productRows = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue);

  const byCategory = new Map<string, { label: string; amount: number; count: number }>();
  for (const e of expenses) {
    const label = EXPENSE_CATEGORY_LABELS[e.category ?? ""] ?? e.category ?? "Other";
    const cur = byCategory.get(label) ?? { label, amount: 0, count: 0 };
    cur.amount = r2(cur.amount + (e.amount ?? 0));
    cur.count += 1;
    byCategory.set(label, cur);
  }
  const categoryRows = [...byCategory.values()].sort((a, b) => b.amount - a.amount);

  const has = (p: ReportPart) => o.parts.includes(p);
  const summary: SalesReport["summary"] = [];
  if (has("sales")) summary.push({ label: "Sales", value: salesTotal, note: `${sales.length} ${sales.length === 1 ? "sale" : "sales"}` });
  if (has("expenses")) summary.push({ label: "Expenses", value: expenseTotal, note: `${expenses.length} ${expenses.length === 1 ? "expense" : "expenses"}` });
  if (has("sales") && has("expenses")) summary.push({ label: "Sales less expenses", value: r2(salesTotal - expenseTotal - (has("spoilage") ? spoiled : 0)) });
  if (o.showOwed) {
    summary.push({ label: "Money in (cash received)", value: moneyIn });
    summary.push({ label: "Money out (cash paid)", value: moneyOut });
  }
  if (has("spoilage")) summary.push({ label: "Spoilage, at cost", value: spoiled });
  if (has("waste")) summary.push({ label: "Waste, at cost", value: wasted, note: "already counted in expenses when bought" });

  const highlights: string[] = [];
  if (has("sales")) {
    if (prevSales > 0) {
      const change = Math.round(((salesTotal - prevSales) / prevSales) * 100);
      highlights.push(`Sales were ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% on the period before (PHP ${prevSales.toLocaleString("en-US", { minimumFractionDigits: 2 })}).`);
    }
    if (productRows[0]) highlights.push(`Best seller: ${productRows[0].name} — ${productRows[0].units} sold.`);
  }
  if (has("expenses") && categoryRows[0]) highlights.push(`Biggest expense: ${categoryRows[0].label} — PHP ${categoryRows[0].amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}.`);
  if (o.showOwed) {
    const owedToUs = sum(entries.filter((e) => obligationKind(e) === "receivable"), (e) => outstanding(e));
    const weOwe = sum(entries.filter((e) => obligationKind(e) === "payable"), (e) => outstanding(e));
    if (owedToUs > 0) highlights.push(`Customers still owe PHP ${owedToUs.toLocaleString("en-US", { minimumFractionDigits: 2 })}.`);
    if (weOwe > 0) highlights.push(`The shop still owes PHP ${weOwe.toLocaleString("en-US", { minimumFractionDigits: 2 })}.`);
  }

  const tables: Table[] = [];
  if (has("sales")) {
    tables.push({
      title: "Sales by product",
      head: ["Product", "Units sold", "Orders", "Sales (PHP)"],
      rows: productRows.map((p) => [p.name, p.units, p.orders, p.revenue]),
      total: ["Total", sum(productRows, (p) => p.units), sales.length, salesTotal],
      money: [3],
    });
  }
  if (has("expenses")) {
    tables.push({
      title: "Expenses by category",
      head: ["Category", "Entries", "Amount (PHP)"],
      rows: categoryRows.map((c) => [c.label, c.count, c.amount]),
      total: ["Total", expenses.length, expenseTotal],
      money: [2],
    });
  }
  if (has("spoilage") && spoilage.length) {
    tables.push({
      title: "Spoilage",
      head: ["Date", "Product", "Qty", "Value at cost (PHP)"],
      rows: spoilage.map((e) => [dayOf(e.timestamp), e.sku ?? "", e.quantity ?? "", e.amount ?? 0]),
      total: ["Total", "", sum(spoilage, (e) => e.quantity ?? 0), spoiled],
      money: [3],
    });
  }
  if (has("waste") && waste.length) {
    tables.push({
      title: "Waste",
      head: ["Date", "Raw material / packaging", "Qty", "Value at cost (PHP)"],
      rows: waste.map((e) => [dayOf(e.timestamp), e.sku ?? "", `${e.quantity ?? ""} ${e.unit ?? ""}`.trim(), e.amount ?? 0]),
      total: ["Total", "", "", wasted],
      money: [3],
    });
  }
  if (o.detail) {
    if (has("sales")) {
      tables.push({
        title: "Every sale",
        head: ["Date", "Buyer", "Products", "Qty", "Paid by", ...(o.showOwed ? ["Still owed"] : []), "Recorded by", "Amount (PHP)"],
        rows: [...sales]
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
          .map((e) => [
            dayOf(e.timestamp),
            e.counterparty ?? "",
            e.lineItems?.length ? e.lineItems.map((l) => `${l.name} x${l.quantity}`).join(", ") : (e.sku ?? ""),
            e.quantity ?? "",
            methodText(e),
            ...(o.showOwed ? [obligationKind(e) ? outstanding(e) : ""] : []),
            e.loggedByName ?? "",
            e.amount ?? 0,
          ]),
        total: ["Total", "", "", sum(sales, (e) => e.quantity ?? 0), "", ...(o.showOwed ? [""] : []), "", salesTotal],
        money: [o.showOwed ? 7 : 6],
      });
    }
    if (has("expenses")) {
      tables.push({
        title: "Every expense",
        head: ["Date", "Paid to", "For", "Category", "Paid by", "Recorded by", "Amount (PHP)"],
        rows: [...expenses]
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
          .map((e) => [dayOf(e.timestamp), e.counterparty ?? "", e.sku ?? "", EXPENSE_CATEGORY_LABELS[e.category ?? ""] ?? e.category ?? "", methodText(e), e.loggedByName ?? "", e.amount ?? 0]),
        total: ["Total", "", "", "", "", "", expenseTotal],
        money: [6],
      });
    }
  }

  return {
    title: "Sales & Expense Report",
    subtitle: o.label,
    summaryTitle: "Executive summary",
    summary,
    highlights,
    tables,
  };
}
