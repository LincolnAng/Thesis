import type { Entry, PaymentStatus, PaymentTerm } from "@/lib/store/types";

/**
 * The money on the Transactions page, kept apart by what kind of number it is:
 *
 *  - CASH (money in, money out): what actually changed hands. A sale on credit is not money in
 *    until it is paid; a purchase on credit is not money out until it is paid.
 *  - OUTSTANDING (payables, receivables): what is still owed, either way. Carried from month to
 *    month until it is settled — the original transaction is never copied, it simply keeps
 *    showing as owed.
 *  - EARNED: sales less expenses and spoilage, paid or not. That is the accounting profit.
 *
 * Investments (R&D, equipment, repairs and the like — the "RND" entry type) are funded by the
 * owners, so they sit on their own tab and stay out of all three.
 *
 * Pure: entries in, figures out.
 */

export type Period = "all" | string; // "YYYY-MM"

export function termOf(e: Pick<Entry, "paymentTerm">): PaymentTerm {
  return e.paymentTerm ?? "spot";
}

export function isInvestment(e: Pick<Entry, "type">): boolean {
  return e.type === "RND";
}

/** Month of an entry in local time ("2026-09"), so a sale late on the 30th isn't filed under next month. */
export function monthOf(e: Pick<Entry, "timestamp">): string {
  const d = new Date(e.timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** What has been paid so far on a payable or receivable. */
export function paidSoFar(e: Pick<Entry, "amount" | "amountPaid" | "paymentStatus">): number {
  const amount = e.amount ?? 0;
  if (e.paymentStatus === "settled") return amount;
  return Math.min(amount, Math.max(0, e.amountPaid ?? 0));
}

/** Still owed. Zero for a spot payment or anything settled. */
export function outstanding(e: Pick<Entry, "amount" | "amountPaid" | "paymentStatus" | "paymentTerm">): number {
  if (termOf(e) === "spot") return 0;
  return Math.max(0, (e.amount ?? 0) - paidSoFar(e));
}

/** The status she noted, or — when she hasn't — what the amount paid says. */
export function statusOf(e: Pick<Entry, "amount" | "amountPaid" | "paymentStatus" | "paymentTerm">): PaymentStatus | null {
  if (termOf(e) === "spot") return null;
  if (e.paymentStatus) return e.paymentStatus;
  const paid = paidSoFar(e);
  if (paid <= 0) return "pending";
  return paid >= (e.amount ?? 0) ? "settled" : "partial";
}

export interface DueInfo {
  /** Days until it is due; negative once overdue. Null when no due date is set. */
  daysLeft: number | null;
  overdue: boolean;
}

/** How far off the due date is, counted in whole calendar days. */
export function dueInfo(e: Pick<Entry, "amount" | "amountPaid" | "paymentStatus" | "paymentTerm" | "dueDate">, now: Date): DueInfo {
  if (!e.dueDate || outstanding(e) <= 0) return { daysLeft: null, overdue: false };
  const [y, m, d] = e.dueDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  return { daysLeft, overdue: daysLeft < 0 };
}

function sum<T>(list: T[], f: (x: T) => number): number {
  return list.reduce((s, x) => s + f(x), 0);
}

/** Entries dated on or before the last day of the period ("all" includes everything). */
function upToEndOf(entries: Entry[], period: Period): Entry[] {
  if (period === "all") return entries;
  return entries.filter((e) => monthOf(e) <= period);
}

export interface LedgerSummary {
  moneyIn: number;
  moneyOut: number;
  earned: number;
  sales: number;
  expenses: number;
  spoiled: number;
  /** Still owed TO the business, from this period and every earlier one. */
  receivables: number;
  /** Still owed BY the business, from this period and every earlier one. */
  payables: number;
  overdueReceivables: number;
  overduePayables: number;
  /** Spent on investments in this period — owner-funded, so not in money out or earned. */
  invested: number;
}

export function summarize(entries: Entry[], period: Period, now: Date): LedgerSummary {
  const inPeriod = period === "all" ? entries : entries.filter((e) => monthOf(e) === period);
  const sales = inPeriod.filter((e) => e.type === "SALE");
  const expenses = inPeriod.filter((e) => e.type === "EXPENSE");
  const spoiled = sum(inPeriod.filter((e) => e.type === "WASTE"), (e) => e.amount ?? 0);
  const cash = (e: Entry) => (termOf(e) === "spot" ? (e.amount ?? 0) : paidSoFar(e));

  const owedSoFar = upToEndOf(entries, period);
  const receivable = owedSoFar.filter((e) => e.type === "SALE" && outstanding(e) > 0);
  const payable = owedSoFar.filter((e) => e.type === "EXPENSE" && outstanding(e) > 0);

  const salesTotal = sum(sales, (e) => e.amount ?? 0);
  const expensesTotal = sum(expenses, (e) => e.amount ?? 0);
  return {
    moneyIn: sum(sales, cash),
    moneyOut: sum(expenses, cash),
    earned: salesTotal - expensesTotal - spoiled,
    sales: salesTotal,
    expenses: expensesTotal,
    spoiled,
    receivables: sum(receivable, outstanding),
    payables: sum(payable, outstanding),
    overdueReceivables: receivable.filter((e) => dueInfo(e, now).overdue).length,
    overduePayables: payable.filter((e) => dueInfo(e, now).overdue).length,
    invested: sum(inPeriod.filter(isInvestment), (e) => e.amount ?? 0),
  };
}

/**
 * Payables and receivables from before this month that are still owed — shown with the month
 * so they aren't forgotten when the calendar turns. The same entry, not a copy: settle it here
 * and it stops being carried, while its original row stays in its own month.
 */
export function carriedOver(entries: Entry[], period: Period): Entry[] {
  if (period === "all") return [];
  return entries
    .filter((e) => (e.type === "SALE" || e.type === "EXPENSE") && monthOf(e) < period && outstanding(e) > 0)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** The patch that records a payment: settles it when it covers what is owed. */
export function recordPayment(e: Entry, paid: number, now: Date): Partial<Entry> {
  const amount = e.amount ?? 0;
  const total = Math.min(amount, Math.max(0, paid));
  if (total >= amount) {
    return { amountPaid: amount, paymentStatus: "settled", settledAt: now.toISOString() };
  }
  return { amountPaid: total, paymentStatus: total > 0 ? "partial" : "pending", settledAt: null };
}
