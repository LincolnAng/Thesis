import type { Reminder } from "@/lib/reminders/reminders";
import type { PayrollRecord, Role, StaffMember, TimeRecord } from "@/lib/store/types";
import { payFor, periodFor, shiftPeriod, parseDay, isoDay } from "@/lib/payroll/pay";

/**
 * Salary reminders for the bell. Executives: payday (the day before and the day itself),
 * anyone left unpaid from last payday, overtime waiting for approval, and 13th month pay in
 * December. The Admin: who still needs timing in today. Employees: nothing — they don't time in.
 */
export function salaryReminders(input: {
  role: Role;
  userId: string | null;
  staff: StaffMember[];
  timeRecords: TimeRecord[];
  payroll: PayrollRecord[];
  today: string;
  contributionsFrom?: string;
}): { today: Reminder[]; upcoming: Reminder[] } {
  const { staff, timeRecords, payroll, today } = input;
  const out = { today: [] as Reminder[], upcoming: [] as Reminder[] };
  const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-US")}`;

  // The Admin (the main computer) times everyone in: who isn't in yet. Employees don't time in.
  if (input.role === "admin") {
    const notIn = staff.filter((s) => s.active && !timeRecords.some((r) => r.staffId === s.id && r.date === today));
    if (notIn.length) {
      out.today.push({
        id: "salary:timein",
        category: "salaries",
        tone: "warn",
        title: `Time in: ${notIn.length === 1 ? notIn[0].name : `${notIn.length} people`}`,
        detail: notIn.length > 1 ? notIn.map((s) => s.name).join(", ") : undefined,
        date: today,
        href: "/salaries",
      });
    }
    return out;
  }
  if (input.role !== "executive") return out;

  const active = staff.filter((s) => s.active);
  if (active.length === 0) return out;
  // Only periods since someone was added here: pay from before the app knew them was settled elsewhere.
  const owed = (p: ReturnType<typeof periodFor>) =>
    active
      .filter((s) => !s.createdAt || s.createdAt.slice(0, 10) <= p.end)
      .map((s) => payFor(s, p, timeRecords, payroll, { contributionsFrom: input.contributionsFrom }))
      .filter((l) => !l.paid && l.gross > 0);

  const current = periodFor(today);
  const tomorrow = (() => {
    const d = parseDay(today);
    d.setDate(d.getDate() + 1);
    return isoDay(d);
  })();
  const due = owed(current);
  if (due.length && today >= current.payday) {
    out.today.push({
      id: "salary:payday",
      category: "salaries",
      tone: "warn",
      title: `Pay salaries: ${peso(due.reduce((n, l) => n + l.net, 0))}`,
      detail: `${due.length === 1 ? "1 person" : `${due.length} people`}${today === current.payday ? " · payday today" : ""}`,
      date: current.payday,
      href: "/salaries",
    });
  } else if (due.length && tomorrow === current.payday) {
    out.upcoming.push({ id: "salary:payday", category: "salaries", tone: "info", title: `Payday: about ${peso(due.reduce((n, l) => n + l.net, 0))} in salaries`, date: current.payday, href: "/salaries" });
  }

  const last = shiftPeriod(current, -1);
  const lastDue = owed(last);
  if (lastDue.length) {
    out.today.push({
      id: "salary:unpaid",
      category: "salaries",
      tone: "bad",
      title: `Pay ${lastDue.map((l) => l.staff.name).join(", ")} — last payday`,
      detail: last.label,
      date: last.payday,
      href: "/salaries",
    });
  }

  const extra = active.reduce((n, s) => n + payFor(s, current, timeRecords).unapprovedExtra, 0);
  if (extra > 0) {
    out.today.push({ id: "salary:ot", category: "salaries", tone: "info", title: `Approve ${extra} hours of overtime`, date: today, href: "/salaries" });
  }

  // Last month's SSS, PhilHealth and Pag-IBIG, until each is recorded as sent.
  const lastMonthEnd = shiftPeriod(periodFor(`${today.slice(0, 7)}-01`), -1);
  const lastMonth = lastMonthEnd.start.slice(0, 7);
  const withContributions = staff
    .filter((s) => !s.createdAt || s.createdAt.slice(0, 10) <= lastMonthEnd.end)
    .map((s) => payFor(s, lastMonthEnd, timeRecords, payroll, { contributionsFrom: input.contributionsFrom }))
    .filter((l) => l.contributions);
  if (withContributions.length) {
    const unsent = (["sss", "philhealth", "pagibig"] as const).filter((a) => !payroll.some((p) => p.kind === "remittance" && p.staffId === a && p.periodStart === `${lastMonth}-01`));
    if (unsent.length) {
      const names = { sss: "SSS", philhealth: "PhilHealth", pagibig: "Pag-IBIG" };
      const monthName = parseDay(`${lastMonth}-01`).toLocaleDateString("en-PH", { month: "long" });
      out.today.push({
        id: "salary:remit",
        category: "salaries",
        tone: "warn",
        title: `Pay ${monthName}'s ${unsent.map((a) => names[a]).join(", ")}`,
        date: today,
        href: "/salaries",
      });
    }
  }

  const year = today.slice(0, 4);
  if (today >= `${year}-12-01`) {
    const unpaid13 = active.filter((s) => !payroll.some((p) => p.kind === "13th" && p.staffId === s.id && p.periodStart.startsWith(year)));
    if (unpaid13.length) {
      const late = today > `${year}-12-24`;
      out.today.push({
        id: "salary:13th",
        category: "salaries",
        tone: late ? "bad" : "warn",
        title: `Pay 13th month ${late ? "— it was due Dec 24" : "by Dec 24"}`,
        detail: `${unpaid13.length === 1 ? "1 person" : `${unpaid13.length} people`} not paid yet`,
        date: `${year}-12-24`,
        href: "/salaries",
      });
    }
  }
  return out;
}
