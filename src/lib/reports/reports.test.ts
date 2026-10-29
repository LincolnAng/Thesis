import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSalesReport } from "./sales-report.ts";
import { buildPayrollReport, periodsFor } from "./payroll-report.ts";
import type { Entry, Product, StaffMember } from "@/lib/store/types";

const products = [{ id: "p1", name: "Tablea", sizeLabel: null, sizeOfId: null }] as unknown as Product[];
const e = (over: Partial<Entry>): Entry => ({ id: Math.random().toString(36), timestamp: "2026-10-05T04:00:00.000Z", type: "SALE", amount: 650, quantity: 2, unit: "packs", sku: "Tablea", counterparty: "Ana", location: null, priceType: "standard", category: null, rawText: "", confidence: 1, paymentMethod: "cash", ...over }) as Entry;

test("the sales report totals sales by product and expenses by category for the period only", () => {
  const entries = [e({}), e({ amount: 325, quantity: 1 }), e({ type: "EXPENSE", amount: 500, sku: "Jars", category: "packaging", quantity: null }), e({ timestamp: "2026-09-05T04:00:00.000Z", amount: 1000 })];
  const r = buildSalesReport(entries, products, { from: "2026-10-01", to: "2026-10-31", label: "October 2026", parts: ["sales", "expenses"], detail: true, showOwed: false });
  const sales = r.tables.find((t) => t.title === "Sales by product")!;
  assert.deepEqual(sales.rows[0], ["Tablea", 3, 2, 975]);
  assert.equal(r.summary.find((s) => s.label === "Sales less expenses")?.value, 475);
  assert.ok(r.highlights.some((h) => h.startsWith("Sales were down")));
  assert.ok(r.tables.some((t) => t.title === "Every sale" && t.rows.length === 2));
  // Only what was ticked goes in.
  const salesOnly = buildSalesReport(entries, products, { from: "2026-10-01", to: "2026-10-31", label: "", parts: ["sales"], detail: false, showOwed: false });
  assert.ok(!salesOnly.tables.some((t) => t.title.includes("Expenses")));
});

test("the payroll report lists each person's pay with totals", () => {
  const staff: StaffMember[] = [{ id: "s1", name: "Shiela", payType: "daily", rate: 500, position: "", pwd: false, userId: null, startDate: null, active: true, allowanceOnly: false, createdAt: "" }];
  const day = (date: string) => ({ id: date, staffId: "s1", date, timeIn: "08:00", timeOut: "16:30", status: "present" as const, otHours: 0, note: "", createdAt: "" });
  const r = buildPayrollReport(staff, [day("2026-10-01"), day("2026-10-02")], [], periodsFor({ kind: "period", day: "2026-10-01" }), "2027-01-01", "Oct 1–15");
  const row = r.tables[0].rows[0];
  assert.equal(row[0], "Shiela");
  assert.equal(row[4], 1000);
  assert.equal(row[10], "Not paid yet");
  assert.equal(r.summary[0].value, 1000);
  assert.equal(periodsFor({ kind: "month", month: "2026-10" }).length, 2);
});
