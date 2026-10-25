import { test } from "node:test";
import assert from "node:assert/strict";
import { salaryReminders } from "./reminders.ts";
import type { StaffMember } from "@/lib/store/types";

const s = (over: Partial<StaffMember>): StaffMember => ({ id: "a", name: "Shiela", payType: "daily", rate: 500, position: "", pwd: false, userId: "u1", startDate: null, active: true, allowanceOnly: false, createdAt: "", ...over });
const day = (date: string) => ({ id: date, staffId: "a", date, timeIn: "08:00", timeOut: "17:00", status: "present" as const, otHours: 0, note: "", createdAt: "" });

test("executives are reminded on payday, and about last payday's unpaid", () => {
  const base = { role: "executive" as const, userId: null, staff: [s({})], payroll: [] };
  const onPayday = salaryReminders({ ...base, timeRecords: [day("2026-10-01"), day("2026-10-02")], today: "2026-10-15" });
  assert.match(onPayday.today[0].title, /Pay salaries: ₱1,000/);
  const before = salaryReminders({ ...base, timeRecords: [day("2026-10-01")], today: "2026-10-14" });
  assert.equal(before.upcoming[0]?.id, "salary:payday");
  const after = salaryReminders({ ...base, timeRecords: [day("2026-10-01")], today: "2026-10-17" });
  assert.match(after.today.find((r) => r.id === "salary:unpaid")?.title ?? "", /Pay Shiela — last payday/);
  // Added to the app after that payday: paid outside it, so no reminder.
  const added = salaryReminders({ ...base, staff: [s({ createdAt: "2026-10-16T09:00:00Z" })], timeRecords: [day("2026-10-01")], today: "2026-10-17" });
  assert.equal(added.today.some((r) => r.id === "salary:unpaid"), false);
});

test("13th month is flagged in December until paid; employees are nudged to time in", () => {
  const dec = salaryReminders({ role: "executive", userId: null, staff: [s({ payType: "monthly", rate: 2000 })], timeRecords: [], payroll: [], today: "2026-12-05" });
  assert.ok(dec.today.some((r) => r.id === "salary:13th"));
  const emp = salaryReminders({ role: "employee", userId: "u1", staff: [s({})], timeRecords: [], payroll: [], today: "2026-10-22" });
  assert.equal(emp.today[0]?.title, "Time in");
  assert.equal(salaryReminders({ role: "employee", userId: "u1", staff: [s({})], timeRecords: [day("2026-10-22")], payroll: [], today: "2026-10-22" }).today.length, 0);
});

test("after a month with contributions, the bell asks to send them until each is recorded", () => {
  const base = { role: "executive" as const, userId: null, staff: [s({ payType: "monthly", rate: 25000, createdAt: "2026-12-01" })], timeRecords: [], today: "2027-02-03" };
  const r = salaryReminders({ ...base, payroll: [] });
  assert.match(r.today.find((x) => x.id === "salary:remit")?.title ?? "", /Pay January's SSS, PhilHealth, Pag-IBIG/);
  const remit = (staffId: string) => ({ id: staffId, staffId, kind: "remittance" as const, periodStart: "2027-01-01", periodEnd: "2027-01-31", basic: 0, overtime: 0, deductions: 0, deductionNote: "", net: 1, paidOn: "2027-02-02", entryId: null, createdAt: "", sss: 0, philhealth: 0, pagibig: 0 });
  const partly = salaryReminders({ ...base, payroll: [remit("sss"), remit("pagibig")] });
  assert.match(partly.today.find((x) => x.id === "salary:remit")?.title ?? "", /Pay January's PhilHealth/);
  // Before contributions start, nothing to send.
  assert.equal(salaryReminders({ ...base, today: "2026-12-03", payroll: [] }).today.some((x) => x.id === "salary:remit"), false);
});
