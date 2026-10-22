import { test } from "node:test";
import assert from "node:assert/strict";
import { extraHours, hoursWorked, payFor, periodFor, shiftPeriod, thirteenthMonth, formatClock } from "./pay.ts";
import type { StaffMember, TimeRecord } from "@/lib/store/types";

const staff = (over: Partial<StaffMember>): StaffMember => ({ id: "s", name: "A", payType: "daily", rate: 500, position: "", pwd: false, userId: null, startDate: null, active: true, createdAt: "", ...over });
const day = (date: string, over: Partial<TimeRecord> = {}): TimeRecord => ({ id: date, staffId: "s", date, timeIn: "08:00", timeOut: "17:00", status: "present", otHours: 0, note: "", createdAt: "", ...over });

test("paydays are the 15th and the 30th (the last day in February)", () => {
  assert.deepEqual(periodFor("2026-10-07"), { start: "2026-10-01", end: "2026-10-15", payday: "2026-10-15", label: "Oct 1–15, 2026" });
  assert.equal(periodFor("2026-10-20").end, "2026-10-31");
  assert.equal(periodFor("2026-10-20").payday, "2026-10-30");
  assert.equal(periodFor("2027-02-20").payday, "2027-02-28");
  assert.equal(shiftPeriod(periodFor("2026-10-07"), -1).start, "2026-09-16");
  assert.equal(shiftPeriod(periodFor("2026-12-20"), 1).start, "2027-01-01");
});

test("hours on the clock take an hour off for lunch; extra hours are in half hours", () => {
  assert.equal(hoursWorked({ timeIn: "08:00", timeOut: "17:00" }), 8);
  assert.equal(hoursWorked({ timeIn: "08:00", timeOut: "12:00" }), 4);
  assert.equal(hoursWorked({ timeIn: "08:00", timeOut: null }), null);
  assert.equal(extraHours({ timeIn: "08:00", timeOut: "19:20" }), 2);
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

test("monthly staff get half their rate each payday, whatever the absences", () => {
  const khent = staff({ payType: "monthly", rate: 25000 });
  assert.equal(payFor(khent, periodFor("2026-10-01"), [day("2026-10-01", { status: "absent" })]).basic, 12500);
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
