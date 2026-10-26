import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addPayment,
  cashMovements,
  changeDueDate,
  confirmDefault,
  editPayment,
  removePayment,
  dueFromTerms,
  entryIntegrityProblem,
  inView,
  obligationInfo,
  obligations,
  outstanding,
  paidSoFar,
  summarize,
} from "./ledger.ts";
import type { Entry } from "@/lib/store/types";

// The Transactions page's money: cash received/paid versus what is still owed. Each test
// below is one of the acceptance scenarios for the payment-tracking work. Run with `npm test`.

const now = new Date(2026, 9, 15, 12, 0); // 15 Oct 2026
const at = (m: number, d: number) => new Date(2026, m, d, 10, 0).toISOString();
const me = { id: "u1", name: "Ate" };

function sale(over: Partial<Entry> = {}): Entry {
  return { id: "s1", type: "SALE", amount: 5000, timestamp: at(9, 1), counterparty: "Juan", sku: null, quantity: null, unit: null, location: null, priceType: null, category: null, rawText: "", confidence: 1, ...over } as Entry;
}
function expense(over: Partial<Entry> = {}): Entry {
  return sale({ id: "x1", type: "EXPENSE", counterparty: "Supplier", ...over });
}
function pay(e: Entry, amount: number, date: string, method = "cash", bankName: string | null = null): Entry {
  const r = addPayment(e, { amount, date, method, bankName }, me, now);
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return { ...e, ...(r as { patch: Partial<Entry> }).patch } as Entry;
}

// ── Test 1: cash received ─────────────────────────────────────────────────

test("1. cash received appears as money received, with its method, and no receivable", () => {
  const e = sale({ amount: 2000, paymentMethod: "cash" });
  const [m] = cashMovements([e]);
  assert.equal(m.direction, "in");
  assert.equal(m.amount, 2000);
  assert.equal(m.method, "cash");
  assert.equal(m.against, null);
  assert.equal(obligations([e], "receivable", now).length, 0);
  assert.equal(summarize([e], "2026-10", now).moneyIn, 2000);
});

// ── Test 2: unpaid receivable ─────────────────────────────────────────────

test("2. an unpaid receivable is owed, not received", () => {
  const e = sale({ paymentTerm: "receivable", dueDate: "2026-11-01", paymentTerms: "net_30" });
  const s = summarize([e], "2026-10", now);
  assert.equal(s.moneyIn, 0);
  assert.equal(s.receivables, 5000);
  assert.equal(cashMovements([e]).length, 0);
  assert.equal(obligationInfo(e, now).status, "unpaid");
});

// ── Test 3: partial receipt ───────────────────────────────────────────────

test("3. a partial receipt reduces the balance and is the only cash counted", () => {
  const e = pay(sale({ paymentTerm: "receivable", dueDate: "2026-11-01" }), 2000, "2026-10-10");
  const s = summarize([e], "2026-10", now);
  assert.equal(s.moneyIn, 2000); // not 5,000
  assert.equal(s.receivables, 3000);
  assert.equal(outstanding(e), 3000);
  assert.equal(e.amount, 5000); // the original is untouched
  assert.equal(obligationInfo(e, now).status, "partial");
  assert.equal(e.payments?.length, 1);
  assert.equal(obligations([e], "receivable", now).length, 1); // not duplicated
});

// ── Tests 4 and 5: payments and payables ──────────────────────────────────

test("4. a cash payment is money paid, with its method", () => {
  const e = expense({ amount: 1500, paymentMethod: "cash" });
  const [m] = cashMovements([e]);
  assert.equal(m.direction, "out");
  assert.equal(summarize([e], "2026-10", now).moneyOut, 1500);
});

test("5. an unpaid payable is owed, not paid", () => {
  const e = expense({ amount: 8000, paymentTerm: "payable", dueDate: "2026-11-14", paymentTerms: "net_30" });
  const s = summarize([e], "2026-10", now);
  assert.equal(s.moneyOut, 0);
  assert.equal(s.payables, 8000);
});

// ── Test 6: bank transfer ─────────────────────────────────────────────────

test("6. a bank transfer carries the bank name and nothing about accounts", () => {
  const e = sale({ amount: 3000, paymentMethod: "bank_transfer", bankName: "BDO" });
  const [m] = cashMovements([e]);
  assert.equal(m.method, "bank_transfer");
  assert.equal(m.bankName, "BDO");
  assert.equal(entryIntegrityProblem(e), null);
  assert.equal(entryIntegrityProblem({ ...e, bankName: null }), "bank_name_required");
});

// ── Test 7: overdue is not default ────────────────────────────────────────

test("7. past its due date with a balance, a receivable is overdue — not defaulted, not received", () => {
  const e = sale({ paymentTerm: "receivable", dueDate: "2026-10-05" });
  const info = obligationInfo(e, now);
  assert.equal(info.status, "overdue");
  assert.equal(info.daysLeft, -10);
  assert.equal(summarize([e], "2026-10", now).moneyIn, 0);
  assert.equal(summarize([e], "2026-10", now).overdueReceivables, 1);
  assert.ok(inView(obligations([e], "receivable", now)[0], "overdue"));
});

test("7b. due today is its own state, and a future date is not overdue", () => {
  assert.equal(obligationInfo(sale({ paymentTerm: "receivable", dueDate: "2026-10-15" }), now).status, "due_today");
  assert.equal(obligationInfo(sale({ paymentTerm: "receivable", dueDate: "2026-10-16" }), now).status, "unpaid");
});

// ── Test 8: confirmed default ─────────────────────────────────────────────

test("8. default is confirmed by the owner; the balance and history stay", () => {
  const overdue = pay(sale({ paymentTerm: "receivable", dueDate: "2026-10-05" }), 1000, "2026-10-02");
  const r = confirmDefault(overdue, now);
  assert.ok(r.ok);
  const defaulted = { ...overdue, ...(r as { patch: Partial<Entry> }).patch } as Entry;
  const info = obligationInfo(defaulted, now);
  assert.equal(info.status, "defaulted");
  assert.equal(info.partlyPaid, true); // earlier payments stay visible
  assert.equal(info.remaining, 4000);
  assert.equal(summarize([defaulted], "2026-10", now).receivables, 4000);
  assert.equal(summarize([defaulted], "2026-10", now).defaultedReceivables, 1);
  assert.equal(summarize([defaulted], "2026-10", now).moneyIn, 1000);
});

test("8b. the same holds for a payable, and only an overdue one can be defaulted", () => {
  const notYet = expense({ paymentTerm: "payable", dueDate: "2026-11-01" });
  assert.equal(confirmDefault(notYet, now).ok, false);
  const late = expense({ paymentTerm: "payable", dueDate: "2026-10-01", amount: 8000 });
  const r = confirmDefault(late, now);
  assert.ok(r.ok);
  const d = { ...late, ...(r as { patch: Partial<Entry> }).patch } as Entry;
  assert.equal(obligationInfo(d, now).status, "defaulted");
  assert.equal(summarize([d], "2026-10", now).moneyOut, 0);
  assert.equal(summarize([d], "2026-10", now).payables, 8000);
});

// ── Test 9: payment after default ─────────────────────────────────────────

test("9. a payment after default is cash, reduces the balance, and keeps the default", () => {
  const overdue = sale({ paymentTerm: "receivable", dueDate: "2026-10-01" });
  const defaulted = { ...overdue, defaultedAt: at(9, 10) } as Entry;
  const after = pay(defaulted, 1000, "2026-10-12");
  const info = obligationInfo(after, now);
  assert.equal(info.status, "defaulted");
  assert.equal(info.remaining, 4000);
  assert.equal(info.wasDefaulted, true);
  assert.equal(summarize([after], "2026-10", now).moneyIn, 1000);
  assert.equal(obligations([after], "receivable", now).length, 1);
});

// ── Test 10: full settlement ──────────────────────────────────────────────

test("10. paying the rest settles it once, keeps every payment, and leaves outstanding totals", () => {
  let e = sale({ paymentTerm: "receivable", dueDate: "2026-11-01" });
  e = pay(e, 4000, "2026-10-05");
  e = pay(e, 1000, "2026-10-12", "bank_transfer", "BPI");
  const info = obligationInfo(e, now);
  assert.equal(info.status, "settled");
  assert.equal(info.remaining, 0);
  assert.equal(e.payments?.length, 2);
  assert.equal(e.paymentStatus, "settled");
  const s = summarize([e], "2026-10", now);
  assert.equal(s.receivables, 0);
  assert.equal(s.moneyIn, 5000); // counted once
});

test("10b. a defaulted obligation paid in full keeps the default in its history", () => {
  const e = pay({ ...sale({ paymentTerm: "receivable", dueDate: "2026-10-01" }), defaultedAt: at(9, 10) } as Entry, 5000, "2026-10-14");
  const info = obligationInfo(e, now);
  assert.equal(info.status, "settled");
  assert.equal(info.wasDefaulted, true);
});

// ── Safeguards ────────────────────────────────────────────────────────────

test("an overpayment is refused, never silently trimmed or misfiled", () => {
  const e = sale({ paymentTerm: "receivable" });
  const r = addPayment(e, { amount: 6000, date: "2026-10-10", method: "cash" }, me, now);
  assert.equal(r.ok, false);
});

test("a bank transfer without a bank, a future date and a zero amount are refused", () => {
  const e = sale({ paymentTerm: "receivable" });
  assert.equal(addPayment(e, { amount: 100, date: "2026-10-10", method: "bank_transfer" }, me, now).ok, false);
  assert.equal(addPayment(e, { amount: 100, date: "2026-12-01", method: "cash" }, me, now).ok, false);
  assert.equal(addPayment(e, { amount: 0, date: "2026-10-10", method: "cash" }, me, now).ok, false);
});

test("a payment can't be dated before the transaction it pays", () => {
  const e = sale({ paymentTerm: "receivable" }); // made on 1 Oct
  assert.equal(addPayment(e, { amount: 100, date: "2026-09-30", method: "cash" }, me, now).ok, false);
  assert.equal(addPayment(e, { amount: 100, date: "2026-10-01", method: "cash" }, me, now).ok, true);
});

test("paying a spot sale or an already settled obligation is refused", () => {
  assert.equal(addPayment(sale(), { amount: 100, date: "2026-10-10", method: "cash" }, me, now).ok, false);
  const done = pay(sale({ paymentTerm: "receivable" }), 5000, "2026-10-10");
  assert.equal(addPayment(done, { amount: 1, date: "2026-10-11", method: "cash" }, me, now).ok, false);
});

test("the server rule: payments can't exceed the amount, and a payable can't sit on a sale", () => {
  const base = sale({ paymentTerm: "receivable" });
  const over = { ...base, payments: [{ id: "p", date: "2026-10-10", amount: 6000, method: "cash", bankName: null, note: null }] };
  assert.equal(entryIntegrityProblem(over), "payments_exceed_amount");
  assert.equal(entryIntegrityProblem({ ...base, paymentTerm: "payable" }), "payable_must_be_an_expense");
  assert.equal(entryIntegrityProblem({ ...base, amount: -5 }), "invalid_amount");
  assert.equal(entryIntegrityProblem(base), null);
});

// ── Taking back a mistake ─────────────────────────────────────────────────

test("a mistyped payment can be removed, and the balance goes back up by exactly that much", () => {
  let e = pay(sale({ paymentTerm: "receivable", dueDate: "2026-11-01" }), 2000, "2026-10-05");
  e = pay(e, 3000, "2026-10-12"); // settles it
  assert.equal(obligationInfo(e, now).status, "settled");
  const second = e.payments![1].id;
  const r = removePayment(e, second, now);
  assert.ok(r.ok);
  const back = { ...e, ...(r as { patch: Partial<Entry> }).patch } as Entry;
  assert.equal(outstanding(back), 3000);
  assert.equal(back.payments?.length, 1);
  assert.equal(obligationInfo(back, now).status, "partial");
  assert.equal(summarize([back], "2026-10", now).moneyIn, 2000);
});

test("a payment can be corrected in place, checked like a new one", () => {
  const e = pay(sale({ paymentTerm: "receivable" }), 200, "2026-10-05"); // meant ₱2,000
  const id = e.payments![0].id;
  const fixed = editPayment(e, id, { amount: 2000, date: "2026-10-05", method: "cash" }, me, now);
  assert.ok(fixed.ok);
  const next = { ...e, ...(fixed as { patch: Partial<Entry> }).patch } as Entry;
  assert.equal(next.payments?.length, 1);
  assert.equal(next.payments?.[0].id, id);
  assert.equal(outstanding(next), 3000);
  assert.equal(editPayment(e, id, { amount: 6000, date: "2026-10-05", method: "cash" }, me, now).ok, false);
});

test("an older running total can be taken back too", () => {
  // Rows from before payments were dated carry their total in as one payment with this id.
  const e = sale({ paymentTerm: "receivable", amountPaid: 1500, paymentStatus: "partial" });
  const r = removePayment(e, `${e.id}-earlier`, now);
  assert.ok(r.ok);
  assert.equal(outstanding({ ...e, ...(r as { patch: Partial<Entry> }).patch } as Entry), 5000);
});

// ── Dates and terms ───────────────────────────────────────────────────────

test("terms give a due date from the transaction's day; changing it keeps the old one", () => {
  assert.equal(dueFromTerms("net_30", "2026-10-15"), "2026-11-14");
  assert.equal(dueFromTerms("immediate", "2026-10-15"), "2026-10-15");
  assert.equal(dueFromTerms("date", "2026-10-15"), null);

  const e = sale({ paymentTerm: "receivable", dueDate: "2026-10-20", paymentTerms: "net_7" });
  const r = changeDueDate(e, { dueDate: "2026-11-05", terms: "date", reason: "Asked for more time" }, me, now);
  assert.ok(r.ok);
  const next = { ...e, ...(r as { patch: Partial<Entry> }).patch } as Entry;
  assert.equal(next.dueDate, "2026-11-05");
  assert.equal(next.dueDateHistory?.[0].from, "2026-10-20");
  assert.equal(next.amount, 5000);
});

// ── Older records ─────────────────────────────────────────────────────────

test("older rows with only a running total or a settled flag still add up, and aren't duplicated", () => {
  const partlyPaid = sale({ paymentTerm: "receivable", amountPaid: 1500, paymentStatus: "partial" });
  assert.equal(paidSoFar(partlyPaid), 1500);
  assert.equal(outstanding(partlyPaid), 3500);
  assert.equal(cashMovements([partlyPaid]).length, 1);

  const settled = sale({ paymentTerm: "receivable", paymentStatus: "settled" });
  assert.equal(outstanding(settled), 0);
  assert.equal(obligationInfo(settled, now).status, "settled");

  // A row with no payment fields at all is an ordinary spot sale.
  const plain = sale();
  assert.equal(obligationInfo(plain, now).status, "settled");
  assert.equal(summarize([plain], "2026-10", now).moneyIn, 5000);
});

test("cash is counted in the month it was paid, not the month of the sale", () => {
  const e = pay(sale({ paymentTerm: "receivable", timestamp: at(8, 20) }), 2000, "2026-10-03");
  assert.equal(summarize([e], "2026-09", now).moneyIn, 0);
  assert.equal(summarize([e], "2026-10", now).moneyIn, 2000);
  // Looking back at September, the whole amount was still owed at the end of that month.
  assert.equal(summarize([e], "2026-09", now).receivables, 5000);
  assert.equal(summarize([e], "2026-10", now).receivables, 3000);
});

test("investments are owner-funded: not cash in or out, not earnings", () => {
  const inv = { ...expense({ type: "RND", amount: 9000 }) } as Entry;
  const s = summarize([inv], "2026-10", now);
  assert.equal(s.moneyOut, 0);
  assert.equal(s.earned, 0);
  assert.equal(s.invested, 9000);
});

// --- Dated payments, capital and long-term assets -------------------------------------------

import { cashInPeriod, summarize as summarizeFn } from "./ledger.ts";

const e = (over: Partial<Entry>): Entry =>
  ({ id: "x", timestamp: "2026-09-10T10:00:00", type: "SALE", amount: 1000, quantity: 1, unit: null, sku: "Tablea", counterparty: null, location: null, priceType: "standard", category: null, rawText: "", confidence: 1, ...over }) as Entry;

test("a payment on a receivable counts as money in the month it was paid, not the month of the sale", () => {
  const sale = e({ paymentTerm: "receivable", payments: [{ id: "p1", date: "2026-10-05", amount: 600, method: "cash", bankName: null, note: null }] });
  assert.equal(cashInPeriod(sale, "2026-09"), 0);
  assert.equal(cashInPeriod(sale, "2026-10"), 600);
  const oct = summarizeFn([sale], "2026-10", new Date(2026, 9, 15));
  assert.equal(oct.moneyIn, 600);
  assert.equal(oct.sales, 0); // the sale itself was in September
  assert.equal(oct.receivables, 400);
});

test("older receivables without dated payments keep counting in the sale's month", () => {
  const sale = e({ paymentTerm: "receivable", amountPaid: 300, paymentStatus: "partial" });
  assert.equal(cashInPeriod(sale, "2026-09"), 300);
  assert.equal(cashInPeriod(sale, "2026-10"), 0);
});

test("capital is money in, but not a sale and not earned", () => {
  const s = summarizeFn([e({ type: "CAPITAL", amount: 50000 }), e({ amount: 1000 })], "2026-09", new Date(2026, 8, 20));
  assert.equal(s.moneyIn, 51000);
  assert.equal(s.capitalIn, 50000);
  assert.equal(s.sales, 1000);
  assert.equal(s.earned, 1000);
});

test("an asset bought on credit is a payable, money out only as it is paid, and never an expense", () => {
  const freezer = e({ type: "ASSET", amount: 30000, paymentTerm: "payable", payments: [{ id: "p2", date: "2026-09-12", amount: 10000, method: "bank_transfer", bankName: "BDO", note: null }] });
  const s = summarizeFn([freezer], "2026-09", new Date(2026, 8, 20));
  assert.equal(s.moneyOut, 10000);
  assert.equal(s.assetsOut, 10000);
  assert.equal(s.assetsBought, 30000);
  assert.equal(s.payables, 20000);
  assert.equal(s.expenses, 0);
  assert.equal(s.earned, 0);
});

test("an unpaid payable paid by bank transfer later is not money out until paid", () => {
  const bill = e({ type: "EXPENSE", amount: 500, paymentTerm: "payable", paymentMethod: "bank_transfer", bankName: "BPI" });
  const s = summarizeFn([bill], "2026-09", new Date(2026, 8, 20));
  assert.equal(s.moneyOut, 0);
  assert.equal(s.payables, 500);
});

test("defaulted receivables stay owed", () => {
  const sale = e({ paymentTerm: "receivable", paymentStatus: "defaulted", payments: [{ id: "p3", date: "2026-09-11", amount: 200, method: "cash", bankName: null, note: null }] });
  const s = summarizeFn([sale], "2026-09", new Date(2026, 8, 20));
  assert.equal(s.receivables, 800);
  assert.equal(s.moneyIn, 200);
});

test("adding a payment carries an older running total in as a first payment, and settles at the full amount", () => {
  const sale = e({ paymentTerm: "receivable", amountPaid: 300, paymentStatus: "partial" });
  const r = addPayment(sale, { date: "2026-10-01", amount: 700, method: "bank_transfer", bankName: "BDO" }, me, new Date(2026, 9, 1));
  assert.ok(r.ok);
  const patch = (r as { patch: Partial<Entry> }).patch;
  assert.equal(patch.payments?.length, 2);
  assert.equal(patch.payments?.[0].date, "2026-09-10");
  assert.equal(patch.paymentStatus, "settled");
  assert.equal(patch.amountPaid, 1000);
});

test("overpaying never counts more cash than was owed", () => {
  const sale = e({ paymentTerm: "receivable", payments: [{ id: "p4", date: "2026-10-01", amount: 900, method: "cash", bankName: null, note: null }, { id: "p5", date: "2026-10-02", amount: 900, method: "cash", bankName: null, note: null }] });
  assert.equal(cashInPeriod(sale, "2026-10"), 1000);
});

test("instalments: equal parts on a schedule, paid earliest first, the next unpaid one is what's due", async () => {
  const { installmentSchedule, currentDueDate, dueInfo, entryIntegrityProblem } = await import("./ledger.ts");
  const e = { amount: 1000, amountPaid: null, paymentStatus: null, paymentTerm: "receivable" as const, dueDate: "2026-04-30", installments: { frequency: "monthly" as const, count: 3, firstDue: "2026-01-31" }, payments: [] as { id: string; date: string; amount: number; method: string | null; bankName: string | null; note: string | null }[] };
  const s = installmentSchedule(e);
  assert.deepEqual(s.map((i) => [i.date, i.amount]), [["2026-01-31", 333.33], ["2026-02-28", 333.33], ["2026-03-31", 333.34]]);
  assert.equal(currentDueDate(e), "2026-01-31");
  const paidOne = { ...e, payments: [{ id: "p", date: "2026-01-30", amount: 400, method: "check", bankName: "BDO", note: null }] };
  assert.equal(currentDueDate(paidOne), "2026-02-28");
  assert.equal(installmentSchedule(paidOne)[1].covered, 66.67);
  assert.equal(dueInfo(paidOne, new Date(2026, 2, 3)).overdue, true);
  assert.equal(installmentSchedule({ ...e, installments: { frequency: "yearly", count: 2, firstDue: "2026-06-15" } })[1].date, "2027-06-15");
  assert.equal(entryIntegrityProblem({ type: "SALE", paymentTerm: "spot", installments: e.installments }), "installments_need_a_receivable_or_payable");
  assert.equal(entryIntegrityProblem({ type: "SALE", paymentTerm: "receivable", paymentMethod: "check", installments: e.installments }), null);
  assert.equal(entryIntegrityProblem({ type: "SALE", paymentMethod: "ewallet", bankName: "GCash" }), null);
  assert.equal(entryIntegrityProblem({ type: "SALE", paymentMethod: "crypto" as never }), "invalid_payment_method");
});
