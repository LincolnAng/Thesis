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
