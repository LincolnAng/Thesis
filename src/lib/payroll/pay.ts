import type { PayrollRecord, StaffMember, TimeRecord } from "@/lib/store/types";

/**
 * How much each person is owed — worked out from their rate and their daily time record, so
 * nobody adds up days by hand. Pure: no store, no React (pay.test.ts).
 *
 * The shop's rules (agreed with the owners):
 * - Paid twice a month: the 1st–15th on the 15th, and the 16th–end of month on the 30th
 *   (the last day, in February).
 * - Daily-rate staff are paid for the days they worked: a full day at their rate, a half day
 *   at half. Days off, absences and leave are unpaid.
 * - Monthly staff get half their monthly rate each payday. Absences don't reduce it.
 * - Overtime is paid at 125% of the hourly rate, and only the hours an Executive approved.
 *   The hourly rate is the daily rate ÷ 8; for monthly staff, the monthly rate × 12 ÷ 313
 *   working days (a six-day week) ÷ 8.
 * - No government deductions (SSS, PhilHealth, Pag-IBIG) yet; cash advances are taken off.
 * - 13th month pay is the basic pay earned in the calendar year ÷ 12 (overtime isn't counted),
 *   due on or before December 24.
 */

export const OT_PREMIUM = 1.25;
export const HOURS_PER_DAY = 8;
export const WORK_DAYS_PER_YEAR = 313;
/** Over this many hours on the clock, an hour is taken off for lunch. */
const LUNCH_AFTER_HOURS = 5;
export const THIRTEENTH_DUE = { month: 12, day: 24 };

export interface PayPeriod {
  /** "YYYY-MM-DD" */
  start: string;
  end: string;
  payday: string;
  /** "Oct 1–15, 2026" */
  label: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
const lastDayOf = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The pay period a day falls in. */
export function periodFor(iso: string): PayPeriod {
  const d = parseDay(iso);
  const y = d.getFullYear();
  const m0 = d.getMonth();
  const last = lastDayOf(y, m0);
  const first = d.getDate() <= 15;
  const startDay = first ? 1 : 16;
  const endDay = first ? 15 : last;
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return {
    start: `${y}-${pad(m0 + 1)}-${pad(startDay)}`,
    end: `${y}-${pad(m0 + 1)}-${pad(endDay)}`,
    payday: `${y}-${pad(m0 + 1)}-${pad(first ? 15 : Math.min(30, last))}`,
    label: `${month} ${startDay}–${endDay}, ${y}`,
  };
}

/** The period `n` periods before (negative) or after (positive) this one. */
export function shiftPeriod(p: PayPeriod, n: number): PayPeriod {
  let cur = p;
  for (let i = 0; i < Math.abs(n); i++) {
    const d = parseDay(n > 0 ? cur.end : cur.start);
    d.setDate(d.getDate() + (n > 0 ? 1 : -1));
    cur = periodFor(isoDay(d));
  }
  return cur;
}

export function daysIn(p: Pick<PayPeriod, "start" | "end">): string[] {
  const out: string[] = [];
  for (let d = parseDay(p.start); isoDay(d) <= p.end; d.setDate(d.getDate() + 1)) out.push(isoDay(d));
  return out;
}

const minutes = (hhmm: string | null) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Hours worked from time in to time out, less an hour for lunch on a long day. Null until both are in. */
export function hoursWorked(r: Pick<TimeRecord, "timeIn" | "timeOut">): number | null {
  const a = minutes(r.timeIn);
  const b = minutes(r.timeOut);
  if (a == null || b == null || b <= a) return null;
  const hours = (b - a) / 60;
  return r2(hours > LUNCH_AFTER_HOURS ? hours - 1 : hours);
}

/** Hours past a full day, in half hours — what an Executive is asked to approve as overtime. */
export function extraHours(r: Pick<TimeRecord, "timeIn" | "timeOut">): number {
  const h = hoursWorked(r);
  return h == null ? 0 : Math.floor(Math.max(0, h - HOURS_PER_DAY) * 2) / 2;
}

/** How much of a day's pay this record earns a daily-rate worker. */
export function dayCredit(r: Pick<TimeRecord, "status">): number {
  return r.status === "present" ? 1 : r.status === "half" ? 0.5 : 0;
}

export function hourlyRate(s: Pick<StaffMember, "payType" | "rate">): number {
  return s.payType === "daily" ? s.rate / HOURS_PER_DAY : (s.rate * 12) / WORK_DAYS_PER_YEAR / HOURS_PER_DAY;
}

export interface PayLine {
  staff: StaffMember;
  period: PayPeriod;
  fullDays: number;
  halfDays: number;
  /** Days on the record with no status counting toward pay — absent, off, leave. */
  unpaidDays: number;
  otHours: number;
  /** Overtime hours on the clock that no one has approved yet (not paid). */
  unapprovedExtra: number;
  basic: number;
  overtime: number;
  gross: number;
  /** Set when this period has already been paid. */
  paid: PayrollRecord | null;
}

/** Monthly staff who started partway through a period are paid for the days from their start. */
function monthlyShare(s: StaffMember, p: PayPeriod): number {
  const half = s.rate / 2;
  if (!s.startDate || s.startDate <= p.start) return half;
  if (s.startDate > p.end) return 0;
  const all = daysIn(p).length;
  const worked = daysIn({ start: s.startDate, end: p.end }).length;
  return (half * worked) / all;
}

export function payFor(staff: StaffMember, period: PayPeriod, records: TimeRecord[], payroll: PayrollRecord[] = []): PayLine {
  const mine = records.filter((r) => r.staffId === staff.id && r.date >= period.start && r.date <= period.end);
  const fullDays = mine.filter((r) => r.status === "present").length;
  const halfDays = mine.filter((r) => r.status === "half").length;
  const unpaidDays = mine.filter((r) => dayCredit(r) === 0).length;
  const otHours = mine.reduce((n, r) => n + (r.otHours || 0), 0);
  const unapprovedExtra = mine.reduce((n, r) => n + Math.max(0, extraHours(r) - (r.otHours || 0)), 0);
  const basic = r2(staff.payType === "daily" ? staff.rate * (fullDays + halfDays / 2) : monthlyShare(staff, period));
  const overtime = r2(otHours * hourlyRate(staff) * OT_PREMIUM);
  const paid = payroll.find((p) => p.kind === "regular" && p.staffId === staff.id && p.periodStart === period.start) ?? null;
  return { staff, period, fullDays, halfDays, unpaidDays, otHours, unapprovedExtra, basic, overtime, gross: r2(basic + overtime), paid };
}

export interface ThirteenthMonth {
  staff: StaffMember;
  year: number;
  /** Basic pay earned so far this year (overtime not counted). */
  basicSoFar: number;
  /** 13th month pay earned so far: basicSoFar ÷ 12. */
  soFar: number;
  /** What it will be by December if things carry on as they have. */
  projected: number;
  due: string;
  paid: PayrollRecord | null;
}

/**
 * 13th month pay for the year, as of `today`. Counts every pay period from January (or the
 * start date) up to and including the one `today` is in — for daily staff those are the days
 * actually on the record, for monthly staff their half-month shares.
 */
export function thirteenthMonth(staff: StaffMember, year: number, today: string, records: TimeRecord[], payroll: PayrollRecord[] = []): ThirteenthMonth {
  const yearEnd = `${year}-12-31`;
  const upTo = today < yearEnd ? today : yearEnd;
  let basicSoFar = 0;
  let periods = 0;
  for (let p = periodFor(`${year}-01-01`); p.start <= upTo; p = shiftPeriod(p, 1)) {
    if (staff.startDate && staff.startDate > p.end) continue;
    periods += 1;
    if (staff.payType === "daily") basicSoFar += payFor(staff, p, records).basic;
    else {
      // The current period counts only the days gone so far.
      const share = monthlyShare(staff, p);
      basicSoFar += p.end <= upTo ? share : (share * daysIn({ start: p.start, end: upTo }).length) / daysIn(p).length;
    }
  }
  basicSoFar = r2(basicSoFar);
  // By December: monthly staff get every half-month share from their start; daily staff are
  // assumed to keep working as they have so far, period for period.
  let projectedBasic = basicSoFar;
  if (staff.active) {
    if (staff.payType === "monthly") {
      projectedBasic = 0;
      for (let p = periodFor(`${year}-01-01`); p.start <= yearEnd; p = shiftPeriod(p, 1)) projectedBasic += monthlyShare(staff, p);
    } else {
      let left = 0;
      for (let p = shiftPeriod(periodFor(upTo), 1); p.start <= yearEnd; p = shiftPeriod(p, 1)) left += 1;
      projectedBasic += periods > 0 ? (basicSoFar / periods) * left : 0;
    }
  }
  return {
    staff,
    year,
    basicSoFar,
    soFar: r2(basicSoFar / 12),
    projected: r2(projectedBasic / 12),
    due: `${year}-${pad(THIRTEENTH_DUE.month)}-${pad(THIRTEENTH_DUE.day)}`,
    paid: payroll.find((p) => p.kind === "13th" && p.staffId === staff.id && p.periodStart.startsWith(String(year))) ?? null,
  };
}

/** Today in the Philippines, "YYYY-MM-DD" — what the server checks an employee's time against. */
export function manilaToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/** The time now in the Philippines, "HH:MM". */
export function manilaTime(now = new Date()): string {
  return now.toLocaleTimeString("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "08:05" → "8:05 AM" */
export function formatClock(hhmm: string | null): string {
  const m = minutes(hhmm);
  if (m == null) return "—";
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${pad(m % 60)} ${h < 12 ? "AM" : "PM"}`;
}
