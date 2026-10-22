import type { Reminder } from "@/lib/reminders/reminders";
import type { PayrollRecord, Role, StaffMember, TimeRecord } from "@/lib/store/types";
import { payFor, periodFor, shiftPeriod, parseDay, isoDay } from "@/lib/payroll/pay";

/**
 * Salary reminders for the bell. Executives: payday (the day before and the day itself),
 * anyone left unpaid from last payday, overtime waiting for approval, and 13th month pay in
 * December. Employees: a nudge to time in, once their profile is linked to a staff member.
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

  if (input.role !== "executive") {
    const mine = staff.find((s) => s.active && s.userId && s.userId === input.userId);
    if (mine && !timeRecords.some((r) => r.staffId === mine.id && r.date === today)) {
      out.today.push({ id: "salary:timein", category: "salaries", tone: "warn", title: "You haven't timed in today", date: today, href: "/salaries" });
    }
    return out;
  }

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
      title: `Payday${today === current.payday ? " today" : ""}: ${peso(due.reduce((n, l) => n + l.net, 0))} for ${due.length === 1 ? "1 person" : `${due.length} people`}`,
      detail: current.label,
      date: current.payday,
      href: "/salaries",
    });
  } else if (due.length && tomorrow === current.payday) {
    out.upcoming.push({ id: "salary:payday", category: "salaries", tone: "info", title: `Payday tomorrow: about ${peso(due.reduce((n, l) => n + l.net, 0))}`, detail: current.label, date: current.payday, href: "/salaries" });
  }

  const last = shiftPeriod(current, -1);
  const lastDue = owed(last);
  if (lastDue.length) {
    out.today.push({
      id: "salary:unpaid",
      category: "salaries",
      tone: "bad",
      title: `Not paid yet from ${last.label}: ${lastDue.map((l) => l.staff.name).join(", ")}`,
      date: last.payday,
      href: "/salaries",
    });
  }

  const extra = active.reduce((n, s) => n + payFor(s, current, timeRecords).unapprovedExtra, 0);
  if (extra > 0) {
    out.today.push({ id: "salary:ot", category: "salaries", tone: "info", title: `${extra} hours of overtime to approve`, detail: "Only approved overtime is paid", date: today, href: "/salaries" });
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
        title: `Send ${monthName}'s ${unsent.map((a) => names[a]).join(", ")} contributions`,
        detail: "Workers' shares plus the shop's — see Salaries",
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
        title: `13th month pay ${late ? "was due Dec 24" : "due by Dec 24"} — ${unpaid13.length === 1 ? "1 person" : `${unpaid13.length} people`} not paid yet`,
        date: `${year}-12-24`,
        href: "/salaries",
      });
    }
  }
  return out;
}
