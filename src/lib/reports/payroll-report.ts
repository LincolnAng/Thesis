import type { PayrollRecord, StaffMember, TimeRecord } from "@/lib/store/types";
import { payFor, periodFor, shiftPeriod, type PayPeriod } from "@/lib/payroll/pay";
import type { Table } from "@/lib/reports/sales-report";

/**
 * The payroll file for Sandy to check on paper: one row per person for a payday (or both paydays
 * of a month) — days worked, overtime, deductions, what they take home, and whether it's been
 * paid — with totals and lines to sign. Worked out the same way as the Payroll tab (lib/payroll/
 * pay); a payslip already recorded shows what was actually paid.
 */

export interface PayrollReport {
  title: string;
  subtitle: string;
  summary: { label: string; value: number; note?: string }[];
  highlights: string[];
  tables: Table[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The paydays a choice covers: one pay period, or both halves of a month. */
export function periodsFor(choice: { kind: "period"; day: string } | { kind: "month"; month: string }): PayPeriod[] {
  if (choice.kind === "period") return [periodFor(choice.day)];
  const first = periodFor(`${choice.month}-01`);
  return [first, shiftPeriod(first, 1)];
}

export function buildPayrollReport(staff: StaffMember[], records: TimeRecord[], payroll: PayrollRecord[], periods: PayPeriod[], contributionsFrom: string, label: string): PayrollReport {
  const people = staff
    .filter((s) => s.active || periods.some((p) => records.some((r) => r.staffId === s.id && r.date >= p.start && r.date <= p.end)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows: (string | number)[][] = [];
  const totals = { basic: 0, ot: 0, gov: 0, add: 0, less: 0, net: 0, unpaid: 0 };
  for (const s of people) {
    for (const p of periods) {
      const line = payFor(s, p, records, payroll, { contributionsFrom });
      if (line.gross <= 0 && !line.paid) continue;
      const paid = line.paid;
      const gov = paid ? paid.sss + paid.philhealth + paid.pagibig : (line.contributions?.employeeTotal ?? 0);
      const add = paid?.additions ?? 0;
      const less = (paid?.deductions ?? 0) + line.breakDeduction;
      const net = paid ? paid.net : line.net;
      totals.basic += line.basic;
      totals.ot += line.overtime;
      totals.gov += gov;
      totals.add += add;
      totals.less += less;
      totals.net += net;
      if (!paid) totals.unpaid += net;
      rows.push([
        s.name,
        periods.length > 1 ? p.label : s.payType === "monthly" ? "Monthly" : "Daily",
        s.payType === "daily" ? line.fullDays + line.halfDays / 2 : line.absentDays ? `${line.absentDays} absent` : "—",
        line.otHours || "—",
        line.basic,
        line.overtime,
        r2(gov),
        r2(add),
        r2(less),
        net,
        paid ? `Paid ${paid.paidOn}` : "Not paid yet",
        "",
      ]);
    }
  }

  const people13 = people.length;
  return {
    title: "Payroll Report",
    subtitle: label,
    summary: [
      { label: "Total take-home pay", value: r2(totals.net), note: `${people13} ${people13 === 1 ? "person" : "people"}` },
      { label: "Basic pay", value: r2(totals.basic) },
      { label: "Overtime", value: r2(totals.ot) },
      { label: "SSS, PhilHealth, Pag-IBIG (workers' share)", value: r2(totals.gov) },
      { label: "Still to pay", value: r2(totals.unpaid) },
    ],
    highlights: [
      totals.unpaid > 0 ? `PHP ${r2(totals.unpaid).toLocaleString("en-US", { minimumFractionDigits: 2 })} hasn't been paid yet.` : "Everyone on this report has been paid.",
      "Daily-rate staff: days worked x rate (half days at half). Monthly staff: half the rate each payday, less rate / 30 a day absent.",
      "Overtime is approved hours at 125%. Breaks past 30 minutes come off pay. Allowances have nothing taken off.",
    ],
    tables: [
      {
        title: "Pay per person",
        head: ["Name", periods.length > 1 ? "Pay period" : "Paid by the", "Days", "OT hrs", "Basic", "Overtime", "Gov't", "Added", "Less", "Take-home", "Status", "Signature"],
        rows,
        total: ["Total", "", "", "", r2(totals.basic), r2(totals.ot), r2(totals.gov), r2(totals.add), r2(totals.less), r2(totals.net), "", ""],
        money: [4, 5, 6, 7, 8, 9],
      },
    ],
  };
}
