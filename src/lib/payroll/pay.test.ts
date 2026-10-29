import { test } from "node:test";
import assert from "node:assert/strict";
import { extraHours, hoursWorked, payFor, periodFor, shiftPeriod, thirteenthMonth, formatClock } from "./pay.ts";
import type { StaffMember, TimeRecord } from "@/lib/store/types";

const staff = (over: Partial<StaffMember>): StaffMember => ({ id: "s", name: "A", payType: "daily", rate: 500, position: "", pwd: false, userId: null, startDate: null, active: true, allowanceOnly: false, createdAt: "", ...over });
const day = (date: string, over: Partial<TimeRecord> = {}): TimeRecord => ({ id: date, staffId: "s", date, timeIn: "08:00", timeOut: "17:00", status: "present", otHours: 0, note: "", createdAt: "", ...over });

test("paydays are the 15th and the last day of the month", () => {
  assert.deepEqual(periodFor("2026-10-07"), { start: "2026-10-01", end: "2026-10-15", payday: "2026-10-15", label: "Oct 1–15, 2026" });
  assert.equal(periodFor("2026-10-20").end, "2026-10-31");
  assert.equal(periodFor("2026-10-20").payday, "2026-10-31");
  assert.equal(periodFor("2026-11-20").payday, "2026-11-30");
  assert.equal(periodFor("2027-02-20").payday, "2027-02-28");
  assert.equal(shiftPeriod(periodFor("2026-10-07"), -1).start, "2026-09-16");
  assert.equal(shiftPeriod(periodFor("2026-12-20"), 1).start, "2027-01-01");
});

test("a 30-minute break comes off the day (or the break actually taken); extra hours are in half hours", () => {
  assert.equal(hoursWorked({ timeIn: "08:00", timeOut: "16:30" }), 8);
  assert.equal(hoursWorked({ timeIn: "08:00", timeOut: "17:00", breakStart: "12:00", breakEnd: "13:00" }), 8);
  assert.equal(hoursWorked({ timeIn: "08:00", timeOut: "12:00" }), 4);
  assert.equal(hoursWorked({ timeIn: "08:00", timeOut: null }), null);
  assert.equal(extraHours({ timeIn: "08:00", timeOut: "18:50" }), 2);
  assert.equal(formatClock("13:05"), "1:05 PM");
});

test("daily staff are paid for days worked, half days at half, approved overtime at 125%", () => {
  const p = periodFor("2026-10-01");
  const records = [day("2026-10-01"), day("2026-10-02", { status: "half" }), day("2026-10-03", { status: "absent" }), day("2026-10-05", { otHours: 2, timeOut: "19:00" }), day("2026-10-16")];
  const line = payFor(staff({ rate: 525 }), p, records);
  assert.equal(line.fullDays, 2);
  assert.equal(line.halfDays, 1);
  assert.equal(line.basic, 525 * 2.5);
  assert.equal(line.overtime, Math.round(2 * (525 / 8) * 1.25 * 100) / 100);
  assert.equal(line.unpaidDays, 1);
});

test("monthly staff get half their rate each payday, less rate ÷ 30 a day absent — unless it's an allowance", () => {
  const khent = staff({ payType: "monthly", rate: 25000 });
  assert.equal(payFor(khent, periodFor("2026-10-01"), []).basic, 12500);
  const absences = [day("2026-10-01", { status: "absent" }), day("2026-10-02", { status: "half" }), day("2026-10-03", { status: "off" }), day("2026-10-04", { status: "leave" })];
  const line = payFor(khent, periodFor("2026-10-01"), absences);
  assert.equal(line.absentDays, 1.5);
  assert.equal(line.basic, Math.round((12500 - (25000 / 30) * 1.5) * 100) / 100);
  const ruchel = staff({ payType: "monthly", rate: 2000, allowanceOnly: true });
  assert.equal(payFor(ruchel, periodFor("2026-10-01"), absences).basic, 1000);
  // Started on the 9th of a 15-day period: 7 of 15 days.
  assert.equal(payFor(staff({ payType: "monthly", rate: 25000, startDate: "2026-10-09" }), periodFor("2026-10-01"), []).basic, Math.round((12500 * 7) / 15 * 100) / 100);
});

test("13th month pay is the year's basic pay ÷ 12", () => {
  const year = thirteenthMonth(staff({ payType: "monthly", rate: 25000 }), 2026, "2026-12-31", []);
  assert.equal(year.soFar, 25000);
  assert.equal(year.projected, 25000);
  const half = thirteenthMonth(staff({ payType: "monthly", rate: 2000 }), 2026, "2026-06-30", []);
  assert.equal(half.soFar, 1000);
  assert.equal(half.projected, 2000);
  assert.equal(half.due, "2026-12-24");
  const daily = thirteenthMonth(staff({ rate: 500 }), 2026, "2026-01-31", [day("2026-01-05"), day("2026-01-06"), day("2026-01-20")]);
  assert.equal(daily.basicSoFar, 1500);
  assert.equal(daily.soFar, 125);
});

test("government contributions come off the end-of-month payday, from January 2027, not from allowances", () => {
  const khent = staff({ payType: "monthly", rate: 25000 });
  assert.equal(payFor(khent, periodFor("2026-12-20"), []).contributions, null);
  assert.equal(payFor(khent, periodFor("2027-01-10"), []).contributions, null);
  const jan = payFor(khent, periodFor("2027-01-20"), []);
  // ₱25,000 a month: SSS MSC 25,000 → ₱1,250; PhilHealth 2.5% → ₱625; Pag-IBIG ₱200.
  assert.equal(jan.contributions?.sss.employee, 1250);
  assert.equal(jan.contributions?.philhealth.employee, 625);
  assert.equal(jan.contributions?.pagibig.employee, 200);
  assert.equal(jan.net, 12500 - 2075);
  assert.equal(payFor(staff({ payType: "monthly", rate: 2000, allowanceOnly: true }), periodFor("2027-01-20"), []).contributions, null);
  // The start date is the shop's to set.
  assert.ok(payFor(khent, periodFor("2026-11-20"), [], [], { contributionsFrom: "2026-11-01" }).contributions);
});

test("break minutes past the 30 allowed come off pay at the hourly rate", () => {
  const p = periodFor("2026-10-01");
  const long = [day("2026-10-01", { breakStart: "12:00", breakEnd: "12:50" }), day("2026-10-02", { breakStart: "12:00", breakEnd: "12:25" })];
  const line = payFor(staff({ rate: 520 }), p, long);
  assert.equal(line.breakOverMinutes, 20);
  assert.equal(line.breakDeduction, Math.round((20 / 60) * (520 / 8) * 100) / 100);
  assert.equal(line.gross, 1040 - line.breakDeduction);
  assert.equal(payFor(staff({ rate: 2000, payType: "monthly", allowanceOnly: true }), p, long).breakDeduction, 0);
});
