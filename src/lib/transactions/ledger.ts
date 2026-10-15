import type { DueDateChange, Entry, PaymentRecord, PaymentStatus } from "@/lib/store/types";

/**
 * The money on the Transactions page, kept apart by what kind of number it is:
 *
 *  - CASH (money received, money paid): what actually changed hands, on the day it did. A
 *    spot sale or expense is one movement on its own date; a sale or purchase on credit is
 *    a receivable or payable whose cash is the payments recorded against it, each on its own
 *    date. An unpaid receivable or payable is never cash.
 *  - OUTSTANDING (receivables, payables): the original amount less what has been paid.
 *    The original amount never changes, and every payment stays on the obligation's history.
 *  - EARNED: sales less expenses and spoilage, paid or not — the accounting profit.
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
 * Pure: entries in, figures out. No store, no React, safe on the server.
 */

export type Period = "all" | string; // "YYYY-MM"

export type ObligationKind = "receivable" | "payable";

const cents = (n: number) => Math.round(n * 100) / 100;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Small helpers ──────────────────────────────────────────────────────────

export function termOf(e: Pick<Entry, "paymentTerm">): "spot" | "payable" | "receivable" {
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

/** The local calendar day of a timestamp ("2026-09-30"). A bare "YYYY-MM-DD" is returned as is. */
export function dayOf(iso: string): string {
  if (DAY_RE.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today, as a local calendar day. */
export function todayOf(now: Date): string {
  return dayOf(now.toISOString());
}

/** Month of an entry in local time ("2026-09"), so a sale late on the 30th isn't filed under next month. */
export function monthOf(e: Pick<Entry, "timestamp">): string {
  return dayOf(e.timestamp).slice(0, 7);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const out = new Date(y, m - 1, d + n);
  return `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, "0")}-${String(out.getDate()).padStart(2, "0")}`;
}

/** Only a sale can be owed TO the business, and only an expense or an asset bought on credit BY it. */
export function obligationKind(e: Pick<Entry, "type" | "paymentTerm">): ObligationKind | null {
  const term = termOf(e);
  if (e.type === "SALE" && term === "receivable") return "receivable";
  if ((e.type === "EXPENSE" || e.type === "ASSET") && term === "payable") return "payable";
  return null;
}

// ── Payment terms ──────────────────────────────────────────────────────────

export const PAYMENT_TERMS: [string, string][] = [
  ["immediate", "Due immediately"],
  ["net_7", "Within 7 days"],
  ["net_15", "Within 15 days"],
  ["net_30", "Within 30 days"],
  ["date", "A specific date"],
  ["custom", "Other arrangement"],
];

export function termsLabel(terms: string | null | undefined): string {
  return PAYMENT_TERMS.find(([k]) => k === terms)?.[1] ?? (terms ? terms : "Not stated");
}

/** The due date an arrangement implies, counted from the transaction's day. Null when it must be picked. */
export function dueFromTerms(terms: string, fromDay: string): string | null {
  switch (terms) {
    case "immediate":
      return fromDay;
    case "net_7":
      return addDays(fromDay, 7);
    case "net_15":
      return addDays(fromDay, 15);
    case "net_30":
      return addDays(fromDay, 30);
    default:
      return null;
  }
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

// ── Status ─────────────────────────────────────────────────────────────────

/**
 * Unpaid → Partially paid → (Due today →) Overdue → Defaulted → Paid / settled.
 * Worked out from the balance, the due date and the owner's confirmation of default — never
 * from a status someone typed, so it can't drift from the payments.
 */
export type ObligationStatus = "unpaid" | "partial" | "due_today" | "overdue" | "defaulted" | "settled";

export interface ObligationInfo {
  status: ObligationStatus;
  /** Something has been paid and a balance remains — kept visible even when overdue or defaulted. */
  partlyPaid: boolean;
  /** Days until due; negative once past. Null with no due date, or nothing owed. */
  daysLeft: number | null;
  /** The owner confirmed default at some point, even if it has since been paid in full. */
  wasDefaulted: boolean;
  paid: number;
  remaining: number;
}

/**
 * The payments on an obligation, oldest first. Older records that only kept a running "paid so
 * far" (or only a settled flag) read as one payment on the transaction's own day, so they are
 * counted once and never lost.
 */
export function paymentsOf(e: Entry): PaymentRecord[] {
  if (e.payments?.length) return [...e.payments].sort((a, b) => a.date.localeCompare(b.date));
  const paid = paidSoFar(e);
  if (paid <= 0) return [];
  return [
    {
      id: `${e.id}-earlier`,
      date: dayOf(e.timestamp),
      amount: paid,
      method: e.paymentMethod ?? null,
      bankName: e.bankName ?? null,
      note: null,
      recordedByName: e.loggedByName ?? null,
    },
  ];
}

/** Where an obligation stands. A spot transaction, owing nothing, reads as settled. */
export function obligationInfo(e: Entry, now: Date): ObligationInfo {
  const paid = paidSoFar(e);
  const remaining = cents(outstanding(e));
  const wasDefaulted = !!e.defaultedAt || e.paymentStatus === "defaulted";
  const { daysLeft } = dueInfo(e, now);
  const partlyPaid = paid > 0 && remaining > 0;
  const status: ObligationStatus =
    remaining <= 0
      ? "settled"
      : wasDefaulted
        ? "defaulted"
        : daysLeft !== null && daysLeft < 0
          ? "overdue"
          : daysLeft === 0
            ? "due_today"
            : partlyPaid
              ? "partial"
              : "unpaid";
  return { status, partlyPaid, daysLeft, wasDefaulted, paid, remaining };
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

export const STATUS_LABELS: Record<ObligationStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partly paid",
  due_today: "Due today",
  overdue: "Overdue",
  defaulted: "Defaulted",
  settled: "Paid in full",
};

/** How it was (or last was) paid: the transaction's own method, else its latest payment's. */
export function methodOf(e: Entry): { method: string | null; bank: string | null } {
  if (e.paymentMethod) return { method: e.paymentMethod, bank: e.bankName ?? null };
  const last = paymentsOf(e).at(-1);
  return last?.method ? { method: last.method, bank: last.bankName } : { method: null, bank: null };
}

// ── Cash movements ─────────────────────────────────────────────────────────

/** One actual receipt or payment: money that really changed hands, on the day it did. */
export interface CashMovement {
  id: string;
  entryId: string;
  direction: "in" | "out";
  /** "YYYY-MM-DD" */
  date: string;
  amount: number;
  method: string | null;
  bankName: string | null;
  /** The customer or supplier. */
  party: string | null;
  /** What it was for: the product or item, when there is one. */
  item: string | null;
  note: string | null;
  recordedByName: string | null;
  /** Set when this is a payment against a receivable or payable. */
  against: null | { original: number; remainingAfter: number; kind: ObligationKind };
}

export function cashMovements(entries: Entry[]): CashMovement[] {
  const out: CashMovement[] = [];
  for (const e of entries) {
    // Capital put in and assets paid for are cash too, so these lists add up to the summary.
    if (e.type !== "SALE" && e.type !== "EXPENSE" && e.type !== "CAPITAL" && e.type !== "ASSET") continue;
    const direction = isMoneyInType(e) ? "in" : "out";
    const kind = obligationKind(e);
    const base = { entryId: e.id, direction, party: e.counterparty, item: e.sku } as const;
    if (!kind) {
      // Spot: paid or received on the transaction's own day.
      if ((e.amount ?? 0) <= 0) continue;
      out.push({
        ...base,
        id: e.id,
        date: dayOf(e.timestamp),
        amount: e.amount as number,
        method: e.paymentMethod ?? null,
        bankName: e.bankName ?? null,
        note: e.notes ?? null,
        recordedByName: e.loggedByName ?? null,
        against: null,
      });
      continue;
    }
    let running = 0;
    for (const p of paymentsOf(e)) {
      running = cents(running + p.amount);
      out.push({
        ...base,
        id: `${e.id}:${p.id}`,
        date: p.date,
        amount: p.amount,
        method: p.method,
        bankName: p.bankName,
        note: p.note,
        recordedByName: p.recordedByName ?? null,
        against: { original: e.amount ?? 0, remainingAfter: cents(Math.max(0, (e.amount ?? 0) - running)), kind },
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ── Obligation lists ───────────────────────────────────────────────────────

export interface ObligationRow {
  entry: Entry;
  kind: ObligationKind;
  original: number;
  info: ObligationInfo;
  payments: PaymentRecord[];
}

export function obligations(entries: Entry[], kind: ObligationKind, now: Date): ObligationRow[] {
  return entries
    .filter((e) => obligationKind(e) === kind)
    .map((entry) => ({
      entry,
      kind,
      original: entry.amount ?? 0,
      info: obligationInfo(entry, now),
      payments: paymentsOf(entry),
    }));
}

/** The views offered above a list of obligations. */
export type ObligationView = "open" | "due_today" | "upcoming" | "overdue" | "defaulted" | "partial" | "settled";

export const VIEW_LABELS: Record<ObligationView, string> = {
  open: "All unpaid",
  due_today: "Due today",
  upcoming: "Upcoming",
  overdue: "Overdue",
  defaulted: "Defaulted",
  partial: "Partly paid",
  settled: "Paid in full",
};

export function inView(row: ObligationRow, view: ObligationView): boolean {
  const s = row.info.status;
  switch (view) {
    case "open":
      return s !== "settled";
    case "due_today":
      return s === "due_today";
    case "upcoming":
      return s === "unpaid" || s === "partial";
    case "overdue":
      return s === "overdue";
    case "defaulted":
      return s === "defaulted";
    case "partial":
      return row.info.partlyPaid;
    case "settled":
      return s === "settled";
  }
}

/** Most urgent first: defaulted, overdue (longest first), due today, then by due date. */
export function sortObligations(rows: ObligationRow[]): ObligationRow[] {
  const rank: Record<ObligationStatus, number> = { defaulted: 0, overdue: 1, due_today: 2, partial: 3, unpaid: 3, settled: 4 };
  return [...rows].sort(
    (a, b) =>
      rank[a.info.status] - rank[b.info.status] ||
      (a.info.daysLeft ?? 1e9) - (b.info.daysLeft ?? 1e9) ||
      b.entry.timestamp.localeCompare(a.entry.timestamp),
  );
}

// ── Summary ────────────────────────────────────────────────────────────────

function sum<T>(list: T[], f: (x: T) => number): number {
  return list.reduce((s, x) => s + f(x), 0);
}

/** Entries dated on or before the last day of the period ("all" includes everything). */
function upToEndOf(entries: Entry[], period: Period): Entry[] {
  if (period === "all") return entries;
  return entries.filter((e) => monthOf(e) <= period);
}

/** Still owed at the end of the period: dated payments made after it haven't happened yet. */
function outstandingAt(e: Entry, period: Period): number {
  if (period === "all" || !e.payments?.length || termOf(e) === "spot") return outstanding(e);
  const amount = e.amount ?? 0;
  const paid = sum(e.payments.filter((p) => p.date.slice(0, 7) <= period), (p) => Math.max(0, p.amount || 0));
  return Math.max(0, cents(amount - Math.min(amount, paid)));
}

export interface LedgerSummary {
  /** Cash that came in this period: sales paid for, payments collected, capital put in. */
  moneyIn: number;
  /** Cash that went out this period: expenses and assets paid for, payments made. */
  moneyOut: number;
  /** Sales less expenses and spoilage, paid or not. */
  earned: number;
  sales: number;
  expenses: number;
  spoiled: number;
  /** Still owed TO the business at the end of the period, from this and every earlier month. */
  receivables: number;
  /** Still owed BY the business at the end of the period. */
  payables: number;
  overdueReceivables: number;
  overduePayables: number;
  /** Confirmed by the owner as defaulted, with a balance still owed. */
  defaultedReceivables: number;
  defaultedPayables: number;
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
  const receivable = owedSoFar.filter((e) => obligationKind(e) === "receivable" && outstandingAt(e, period) > 0);
  const payable = owedSoFar.filter((e) => obligationKind(e) === "payable" && outstandingAt(e, period) > 0);
  const statusIs = (status: ObligationStatus) => (e: Entry) => obligationInfo(e, now).status === status;

  const salesTotal = sum(sales, (e) => e.amount ?? 0);
  const expensesTotal = sum(expenses, (e) => e.amount ?? 0);
  return {
    moneyIn: sum(cashIn, (e) => cashInPeriod(e, period)),
    moneyOut: sum(cashOut, (e) => cashInPeriod(e, period)),
    earned: salesTotal - expensesTotal - spoiled,
    sales: salesTotal,
    expenses: expensesTotal,
    spoiled,
    receivables: sum(receivable, (e) => outstandingAt(e, period)),
    payables: sum(payable, (e) => outstandingAt(e, period)),
    overdueReceivables: receivable.filter(statusIs("overdue")).length,
    overduePayables: payable.filter(statusIs("overdue")).length,
    defaultedReceivables: receivable.filter(statusIs("defaulted")).length,
    defaultedPayables: payable.filter(statusIs("defaulted")).length,
    capitalIn: sum(cashIn.filter((e) => e.type === "CAPITAL"), (e) => cashInPeriod(e, period)),
    assetsOut: sum(cashOut.filter((e) => e.type === "ASSET"), (e) => cashInPeriod(e, period)),
    assetsBought: sum(inPeriod.filter((e) => e.type === "ASSET"), (e) => e.amount ?? 0),
    invested: sum(inPeriod.filter(isInvestment), (e) => e.amount ?? 0),
  };
}

// ── Changes: each returns the fields to write, or why it can't ─────────────

export type Change = { ok: true; patch: Partial<Entry> } | { ok: false; reason: string };

export interface PaymentInput {
  amount: number;
  /** "YYYY-MM-DD" */
  date: string;
  method: string;
  bankName?: string | null;
  note?: string | null;
}

const fail = (reason: string): Change => ({ ok: false, reason });

/** A fresh id for a payment. */
function paymentId(entryId: string, n: number): string {
  return `pay-${entryId.slice(-6)}-${n}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Records one receipt or payment against an obligation. It reduces the remaining balance and
 * adds to the history; the original amount, its due date and its past are left alone. It
 * refuses anything that would take the balance below zero rather than guessing where the
 * extra belongs.
 */
export function addPayment(e: Entry, input: PaymentInput, who: { id?: string | null; name?: string | null }, now: Date): Change {
  if (!obligationKind(e)) return fail("Only a receivable or a payable takes payments.");
  const remaining = cents(outstanding(e));
  if (remaining <= 0) return fail("This has been paid in full.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) return fail("Enter an amount above zero.");
  if (!DAY_RE.test(input.date)) return fail("Pick the day the money changed hands.");
  if (input.date > todayOf(now)) return fail("The payment date can't be in the future.");
  if (input.date < dayOf(e.timestamp)) return fail("The payment can't be dated before the transaction it pays.");
  if (input.method !== "cash" && input.method !== "bank_transfer") return fail("Say whether it was cash or a bank transfer.");
  const bankName = input.method === "bank_transfer" ? input.bankName?.trim() || null : null;
  if (input.method === "bank_transfer" && !bankName) return fail("Name the bank the transfer went through.");
  const amount = cents(input.amount);
  if (amount > remaining + 0.005) return fail(`That is more than the ${formatAmount(remaining)} still owed.`);

  // An older running total is carried in as a first payment, so it isn't lost.
  const existing = paymentsOf(e);
  const payment: PaymentRecord = {
    id: paymentId(e.id, existing.length + 1),
    date: input.date,
    amount,
    method: input.method,
    bankName,
    note: input.note?.trim() || null,
    recordedById: who.id ?? null,
    recordedByName: who.name ?? null,
  };
  const payments = [...existing, payment];
  const total = e.amount ?? 0;
  const paid = Math.min(total, cents(sum(payments, (p) => p.amount)));
  const wasDefaulted = !!e.defaultedAt || e.paymentStatus === "defaulted";
  // A default stays on the record even once it is paid.
  const defaultedAt = wasDefaulted ? (e.defaultedAt ?? now.toISOString()) : (e.defaultedAt ?? null);
  if (paid >= total - 0.005) {
    return { ok: true, patch: { payments, amountPaid: total, paymentStatus: "settled", settledAt: now.toISOString(), defaultedAt } };
  }
  return { ok: true, patch: { payments, amountPaid: paid, paymentStatus: wasDefaulted ? "defaulted" : "partial", settledAt: null, defaultedAt } };
}

/** What a set of payments comes to on an obligation: the running total, and whether it is settled. */
function settleWith(e: Entry, payments: PaymentRecord[], now: Date): Partial<Entry> {
  const total = e.amount ?? 0;
  const paid = Math.min(total, cents(sum(payments, (p) => p.amount)));
  const wasDefaulted = !!e.defaultedAt || e.paymentStatus === "defaulted";
  if (payments.length > 0 && paid >= total - 0.005) {
    return { payments, amountPaid: total, paymentStatus: "settled", settledAt: e.settledAt ?? now.toISOString() };
  }
  return {
    payments: payments.length > 0 ? payments : null,
    amountPaid: paid > 0 ? paid : null,
    paymentStatus: wasDefaulted ? "defaulted" : paid > 0 ? "partial" : "pending",
    settledAt: null,
  };
}

/**
 * Takes back one payment that was recorded by mistake. The balance goes back up by exactly that
 * much; everything else on the obligation — its amount, due date, default — is left as it was.
 */
export function removePayment(e: Entry, paymentId: string, now: Date): Change {
  if (!obligationKind(e)) return fail("Only a receivable or a payable has payments.");
  const existing = paymentsOf(e);
  if (!existing.some((p) => p.id === paymentId)) return fail("That payment isn't on this record any more.");
  return { ok: true, patch: settleWith(e, existing.filter((p) => p.id !== paymentId), now) };
}

/**
 * Corrects one payment: its amount, day or how it was paid. Checked exactly like a new payment
 * against what was owed without it, so a correction can't overpay or pre-date the transaction.
 * It keeps its place in the history.
 */
export function editPayment(e: Entry, paymentId: string, input: PaymentInput, who: { id?: string | null; name?: string | null }, now: Date): Change {
  const removed = removePayment(e, paymentId, now);
  if (!removed.ok) return removed;
  const without = { ...e, ...removed.patch } as Entry;
  const added = addPayment(without, input, who, now);
  if (!added.ok) return added;
  const payments = (added.patch.payments ?? []).map((p, i, all) => (i === all.length - 1 ? { ...p, id: paymentId } : p));
  return { ok: true, patch: { ...added.patch, payments: [...payments].sort((a, b) => a.date.localeCompare(b.date)) } };
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

/** The owner confirms that an overdue obligation has defaulted. The balance stays; nothing is written off. */
export function confirmDefault(e: Entry, now: Date): Change {
  if (!obligationKind(e)) return fail("Only a receivable or a payable can default.");
  const info = obligationInfo(e, now);
  if (info.status === "settled") return fail("This has been paid in full.");
  if (info.wasDefaulted) return fail("This is already marked as defaulted.");
  if (info.status !== "overdue") return fail("It can be marked as defaulted once its due date has passed and a balance remains.");
  return { ok: true, patch: { defaultedAt: now.toISOString(), paymentStatus: "defaulted" } };
}

/** Moves the agreed deadline, keeping the old one in the history. */
export function changeDueDate(
  e: Entry,
  next: { dueDate: string; terms?: string | null; reason?: string | null },
  who: { name?: string | null },
  now: Date,
): Change {
  if (!obligationKind(e)) return fail("Only a receivable or a payable has a due date.");
  if (!DAY_RE.test(next.dueDate)) return fail("Pick the new due date.");
  if (next.dueDate === e.dueDate && (!next.terms || next.terms === e.paymentTerms)) return fail("That is the same due date.");
  const change: DueDateChange = {
    from: e.dueDate ?? null,
    to: next.dueDate,
    changedAt: now.toISOString(),
    changedByName: who.name ?? null,
    reason: next.reason?.trim() || null,
  };
  return {
    ok: true,
    patch: {
      dueDate: next.dueDate,
      paymentTerms: next.terms ?? e.paymentTerms ?? null,
      dueDateHistory: [...(e.dueDateHistory ?? []), change],
    },
  };
}

function formatAmount(n: number): string {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ── Integrity: the rules the server holds every saved entry to ─────────────

/**
 * Returns why an entry can't be saved, or null. Run on the server for every write, so a
 * screen that forgets a check can't corrupt the ledger. Only the fields it looks at are
 * judged; an older row without them passes.
 */
export function entryIntegrityProblem(e: Partial<Entry>): string | null {
  const amount = e.amount;
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) return "invalid_amount";

  if (e.paymentTerm === "receivable" && e.type !== "SALE") return "receivable_must_be_a_sale";
  if (e.paymentTerm === "payable" && e.type !== "EXPENSE" && e.type !== "ASSET") return "payable_must_be_an_expense";

  if (e.dueDate && !DAY_RE.test(e.dueDate)) return "invalid_due_date";
  if (e.paymentMethod && e.paymentMethod !== "cash" && e.paymentMethod !== "bank_transfer") return "invalid_payment_method";
  if (e.paymentMethod === "bank_transfer" && !e.bankName?.trim()) return "bank_name_required";

  if (e.payments && e.payments.length > 0) {
    let total = 0;
    for (const p of e.payments) {
      if (!Number.isFinite(p.amount) || p.amount <= 0) return "invalid_payment_amount";
      if (!DAY_RE.test(p.date)) return "invalid_payment_date";
      if (p.method === "bank_transfer" && !p.bankName?.trim()) return "bank_name_required";
      total += p.amount;
    }
    if (amount != null && total > amount + 0.005) return "payments_exceed_amount";
  }
  return null;
}
