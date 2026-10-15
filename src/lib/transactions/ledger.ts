import type { Entry, PaymentRecord, PaymentStatus, PaymentTerm } from "@/lib/store/types";

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
 * Investments come in two kinds, kept apart from sales and expenses alike:
 *  - CAPITAL: money an owner or investor puts in. Money in — but never a sale, never earned.
 *  - ASSET: money spent on something the business keeps (machinery, a freezer). Money out when
 *    paid, a payable until then — but never an everyday expense, so never in earned.
 * Older investments (the "RND" type, recorded before these two existed) were funded by the
 * owners personally; they keep that treatment and stay out of all three, as they always have.
 *
 * Cash is counted in the month it moved. A spot transaction moves on its own date. A payable
 * or receivable with dated payments counts each payment in its own month; older ones recorded
 * before payments were dated count what was paid in the transaction's month, as before.
 *
 * Pure: entries in, figures out.
 */

export type Period = "all" | string; // "YYYY-MM"

export function termOf(e: Pick<Entry, "paymentTerm">): PaymentTerm {
  return e.paymentTerm ?? "spot";
}

/** Older, owner-funded investments ("RND"). */
export function isInvestment(e: Pick<Entry, "type">): boolean {
  return e.type === "RND";
}

/** Any of the investment kinds: capital put in, assets bought, or older owner-funded ones. */
export function isAnyInvestment(e: Pick<Entry, "type">): boolean {
  return e.type === "RND" || e.type === "CAPITAL" || e.type === "ASSET";
}

/** Money coming in: sales and capital. Everything else that moves money is money out. */
function isMoneyInType(e: Pick<Entry, "type">): boolean {
  return e.type === "SALE" || e.type === "CAPITAL";
}

/** Entry types that can be bought or sold on credit, with a payable or receivable. */
export function canBeOwed(e: Pick<Entry, "type">): boolean {
  return e.type === "SALE" || e.type === "EXPENSE" || e.type === "ASSET";
}

/** Month of an entry in local time ("2026-09"), so a sale late on the 30th isn't filed under next month. */
export function monthOf(e: Pick<Entry, "timestamp">): string {
  const d = new Date(e.timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Owed = Pick<Entry, "amount" | "amountPaid" | "paymentStatus" | "paymentTerm"> & { payments?: PaymentRecord[] | null };

function paymentsTotal(e: { payments?: PaymentRecord[] | null }): number | null {
  if (!e.payments?.length) return null;
  return e.payments.reduce((s, p) => s + Math.max(0, p.amount || 0), 0);
}

/** What has been paid so far on a payable or receivable — the dated payments when there are any. */
export function paidSoFar(e: Pick<Entry, "amount" | "amountPaid" | "paymentStatus"> & { payments?: PaymentRecord[] | null }): number {
  const amount = e.amount ?? 0;
  if (e.paymentStatus === "settled") return amount;
  return Math.min(amount, Math.max(0, paymentsTotal(e) ?? e.amountPaid ?? 0));
}

/** Still owed. Zero for a spot payment or anything settled. */
export function outstanding(e: Owed): number {
  if (termOf(e) === "spot") return 0;
  return Math.max(0, (e.amount ?? 0) - paidSoFar(e));
}

/** The status she noted, or — when she hasn't — what the amount paid says. */
export function statusOf(e: Owed): PaymentStatus | null {
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
export function dueInfo(e: Owed & Pick<Entry, "dueDate">, now: Date): DueInfo {
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
  /** Cash that came in this period: sales paid for, payments collected, capital put in. */
  moneyIn: number;
  /** Cash that went out this period: expenses and assets paid for, payments made. */
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
  /** Of money in: capital put in by owners or investors. */
  capitalIn: number;
  /** Of money out: paid for long-term assets. */
  assetsOut: number;
  /** Asset purchases this period, paid or not. */
  assetsBought: number;
  /** Older owner-funded investments this period — not in money in, out or earned. */
  invested: number;
}

const inMonth = (iso: string, period: Period) => period === "all" || iso.slice(0, 7) === period;

/**
 * Cash an entry moved in the period. Spot: its amount, in its own month. On credit with dated
 * payments: the payments made in the period. On credit without them (older records): what was
 * paid, in the entry's month.
 */
export function cashInPeriod(e: Entry, period: Period): number {
  if (e.type === "CAPITAL") return monthOf(e) === period || period === "all" ? (e.amount ?? 0) : 0;
  if (termOf(e) === "spot") return monthOf(e) === period || period === "all" ? (e.amount ?? 0) : 0;
  if (e.payments?.length) {
    const amount = e.amount ?? 0;
    // Payments are counted in order and never beyond what was owed.
    let counted = 0;
    let inside = 0;
    for (const p of [...e.payments].sort((a, b) => a.date.localeCompare(b.date))) {
      const take = Math.max(0, Math.min(p.amount || 0, amount - counted));
      counted += take;
      if (inMonth(p.date, period)) inside += take;
    }
    return inside;
  }
  return monthOf(e) === period || period === "all" ? paidSoFar(e) : 0;
}

export function summarize(entries: Entry[], period: Period, now: Date): LedgerSummary {
  const inPeriod = period === "all" ? entries : entries.filter((e) => monthOf(e) === period);
  const sales = inPeriod.filter((e) => e.type === "SALE");
  const expenses = inPeriod.filter((e) => e.type === "EXPENSE");
  const spoiled = sum(inPeriod.filter((e) => e.type === "WASTE"), (e) => e.amount ?? 0);

  // Cash is looked for across every entry: a payment this month can settle last month's sale.
  const moving = entries.filter((e) => e.type === "SALE" || e.type === "EXPENSE" || e.type === "ASSET" || e.type === "CAPITAL");
  const cashIn = moving.filter(isMoneyInType);
  const cashOut = moving.filter((e) => !isMoneyInType(e));

  const owedSoFar = upToEndOf(entries, period);
  const receivable = owedSoFar.filter((e) => e.type === "SALE" && outstanding(e) > 0);
  const payable = owedSoFar.filter((e) => (e.type === "EXPENSE" || e.type === "ASSET") && outstanding(e) > 0);

  const salesTotal = sum(sales, (e) => e.amount ?? 0);
  const expensesTotal = sum(expenses, (e) => e.amount ?? 0);
  return {
    moneyIn: sum(cashIn, (e) => cashInPeriod(e, period)),
    moneyOut: sum(cashOut, (e) => cashInPeriod(e, period)),
    earned: salesTotal - expensesTotal - spoiled,
    sales: salesTotal,
    expenses: expensesTotal,
    spoiled,
    receivables: sum(receivable, outstanding),
    payables: sum(payable, outstanding),
    overdueReceivables: receivable.filter((e) => dueInfo(e, now).overdue).length,
    overduePayables: payable.filter((e) => dueInfo(e, now).overdue).length,
    capitalIn: sum(cashIn.filter((e) => e.type === "CAPITAL"), (e) => cashInPeriod(e, period)),
    assetsOut: sum(cashOut.filter((e) => e.type === "ASSET"), (e) => cashInPeriod(e, period)),
    assetsBought: sum(inPeriod.filter((e) => e.type === "ASSET"), (e) => e.amount ?? 0),
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
    .filter((e) => canBeOwed(e) && monthOf(e) < period && outstanding(e) > 0)
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

/**
 * The patch that adds one dated payment. Older records that only kept a running "paid so far"
 * get it carried in as a first payment on their own date, so nothing already paid is lost.
 */
export function addPayment(e: Entry, payment: PaymentRecord, now: Date): Partial<Entry> {
  const amount = e.amount ?? 0;
  const existing: PaymentRecord[] = e.payments?.length
    ? e.payments
    : (e.amountPaid ?? 0) > 0
      ? [{ date: e.timestamp.slice(0, 10), amount: e.amountPaid ?? 0, method: e.paymentMethod ?? "cash", bankName: e.bankName ?? null }]
      : [];
  const payments = [...existing, { ...payment, amount: Math.max(0, payment.amount) }];
  const paid = Math.min(amount, payments.reduce((s, p) => s + p.amount, 0));
  if (paid >= amount) return { payments, amountPaid: amount, paymentStatus: "settled", settledAt: now.toISOString() };
  return { payments, amountPaid: paid, paymentStatus: paid > 0 ? "partial" : "pending", settledAt: null };
}
