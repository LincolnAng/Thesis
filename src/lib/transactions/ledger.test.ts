import { test } from "node:test";
import assert from "node:assert/strict";
import { carriedOver, dueInfo, outstanding, recordPayment, statusOf, summarize } from "./ledger.ts";

// The Transactions page's money: cash, what's owed, and earnings. Run with `npm test`.

const now = new Date(2026, 9, 15, 12, 0); // 15 Oct 2026
const at = (m: number, d: number) => new Date(2026, m, d, 10, 0).toISOString();

const entries = [
  { id: "s-spot", type: "SALE", amount: 1000, timestamp: at(9, 3) },
  { id: "s-credit", type: "SALE", amount: 2000, paymentTerm: "receivable", amountPaid: 500, dueDate: "2026-10-10", timestamp: at(9, 5) },
  { id: "s-old", type: "SALE", amount: 800, paymentTerm: "receivable", dueDate: "2026-10-20", timestamp: at(8, 20) },
  { id: "x-spot", type: "EXPENSE", amount: 300, timestamp: at(9, 4) },
  { id: "x-credit", type: "EXPENSE", amount: 1200, paymentTerm: "payable", timestamp: at(9, 6) },
  { id: "x-paid-old", type: "EXPENSE", amount: 400, paymentTerm: "payable", paymentStatus: "settled", timestamp: at(8, 2) },
  { id: "w", type: "WASTE", amount: 100, timestamp: at(9, 7) },
  { id: "inv", type: "RND", amount: 5000, category: "equipment", timestamp: at(9, 8) },
] as never;

test("money in counts only cash received: spot sales, and what was paid on credit sales", () => {
  const s = summarize(entries, "2026-10", now);
  assert.equal(s.moneyIn, 1000 + 500);
});

test("money out counts only cash paid, and never investments", () => {
  const s = summarize(entries, "2026-10", now);
  assert.equal(s.moneyOut, 300); // the payable is unpaid; the ₱5,000 investment is the owners'
});

test("earned is sales less expenses and spoilage, paid or not, without investments", () => {
  const s = summarize(entries, "2026-10", now);
  assert.equal(s.earned, 3000 - 1500 - 100);
  assert.equal(s.invested, 5000);
});

test("receivables and payables include what is still owed from earlier months", () => {
  const s = summarize(entries, "2026-10", now);
  assert.equal(s.receivables, 1500 + 800); // October's ₱1,500 still owed + September's ₱800
  assert.equal(s.payables, 1200); // September's payable was settled
});

test("an earlier month's view doesn't count debts that came later", () => {
  const s = summarize(entries, "2026-09", now);
  assert.equal(s.receivables, 800);
  assert.equal(s.payables, 0);
});

test("overdue is counted from the due date", () => {
  const s = summarize(entries, "2026-10", now);
  assert.equal(s.overdueReceivables, 1); // due 10 Oct, still ₱1,500 owed
  const due = dueInfo({ amount: 800, paymentTerm: "receivable", dueDate: "2026-10-20" } as never, now);
  assert.deepEqual(due, { daysLeft: 5, overdue: false });
});

test("carried over: earlier months' unsettled payables and receivables, not copies", () => {
  const list = carriedOver(entries, "2026-10").map((e: { id: string }) => e.id);
  assert.deepEqual(list, ["s-old"]);
});

test("status follows the amount paid unless noted by hand", () => {
  assert.equal(statusOf({ amount: 100, paymentTerm: "receivable", amountPaid: 0 } as never), "pending");
  assert.equal(statusOf({ amount: 100, paymentTerm: "receivable", amountPaid: 40 } as never), "partial");
  assert.equal(statusOf({ amount: 100, paymentTerm: "receivable", amountPaid: 100 } as never), "settled");
  assert.equal(statusOf({ amount: 100, paymentTerm: "receivable", paymentStatus: "settled" } as never), "settled");
  assert.equal(statusOf({ amount: 100 } as never), null); // spot
  assert.equal(outstanding({ amount: 100, paymentTerm: "payable", paymentStatus: "settled", amountPaid: 0 } as never), 0);
});

test("recording a payment settles it once it covers what is owed", () => {
  const e = { id: "r", type: "SALE", amount: 900, paymentTerm: "receivable", timestamp: at(9, 1) } as never;
  assert.deepEqual(recordPayment(e, 300, now), { amountPaid: 300, paymentStatus: "partial", settledAt: null });
  const full = recordPayment(e, 900, now);
  assert.equal(full.paymentStatus, "settled");
  assert.equal(full.amountPaid, 900);
});

// --- Dated payments, capital and long-term assets -------------------------------------------

import { addPayment as addPaymentFn, cashInPeriod, summarize as summarizeFn } from "./ledger.ts";
import type { Entry } from "@/lib/store/types";

const e = (over: Partial<Entry>): Entry =>
  ({ id: "x", timestamp: "2026-09-10T10:00:00", type: "SALE", amount: 1000, quantity: 1, unit: null, sku: "Tablea", counterparty: null, location: null, priceType: "standard", category: null, rawText: "", confidence: 1, ...over }) as Entry;

test("a payment on a receivable counts as money in the month it was paid, not the month of the sale", () => {
  const sale = e({ paymentTerm: "receivable", payments: [{ date: "2026-10-05", amount: 600, method: "cash" }] });
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
  const freezer = e({ type: "ASSET", amount: 30000, paymentTerm: "payable", payments: [{ date: "2026-09-12", amount: 10000, method: "bank_transfer", bankName: "BDO" }] });
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
  const sale = e({ paymentTerm: "receivable", paymentStatus: "defaulted", payments: [{ date: "2026-09-11", amount: 200, method: "cash" }] });
  const s = summarizeFn([sale], "2026-09", new Date(2026, 8, 20));
  assert.equal(s.receivables, 800);
  assert.equal(s.moneyIn, 200);
});

test("adding a payment carries an older running total in as a first payment, and settles at the full amount", () => {
  const sale = e({ paymentTerm: "receivable", amountPaid: 300, paymentStatus: "partial" });
  const patch = addPaymentFn(sale, { date: "2026-10-01", amount: 700, method: "bank_transfer", bankName: "BDO" }, new Date(2026, 9, 1));
  assert.equal(patch.payments?.length, 2);
  assert.equal(patch.payments?.[0].date, "2026-09-10");
  assert.equal(patch.paymentStatus, "settled");
  assert.equal(patch.amountPaid, 1000);
});

test("overpaying never counts more cash than was owed", () => {
  const sale = e({ paymentTerm: "receivable", payments: [{ date: "2026-10-01", amount: 900, method: "cash" }, { date: "2026-10-02", amount: 900, method: "cash" }] });
  assert.equal(cashInPeriod(sale, "2026-10"), 1000);
});
