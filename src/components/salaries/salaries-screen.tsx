"use client";

import { useMemo, useState } from "react";
import { Printer, Undo2 } from "lucide-react";
import { Page, PageTabs } from "@/components/layout/page";
import { CarouselNav } from "@/components/ui/carousel-nav";
import { Pill } from "@/components/ui/kit";
import { useStore } from "@/lib/store/use-store";
import { recordSalaryPayment, undoSalaryPayment } from "@/lib/store/store";
import { formatPeso, pluralize } from "@/lib/format";
import { manilaToday, payFor, periodFor, shiftPeriod, thirteenthMonth, type PayLine, type ThirteenthMonth } from "@/lib/payroll/pay";
import type { PayrollRecord, StaffMember } from "@/lib/store/types";
import { PayDialog, printPayslip, type PayBreakdown } from "@/components/salaries/pay-dialog";
import { StaffList, rateLabel } from "@/components/salaries/staff-list";
import { TimeRecordGrid } from "@/components/salaries/time-record";
import { TimeInPanel } from "@/components/salaries/time-in-panel";

/**
 * Salaries, for Executives: who's owed what this payday, worked out from each person's rate and
 * time record; the time record itself; 13th month pay; and the staff list. Paying someone
 * records a salary expense in Transactions, so the money side of the app stays complete.
 *
 * The rules (paydays, overtime, 13th month) are in lib/payroll/pay.
 */

type Tab = "payroll" | "time" | "thirteenth" | "staff";
const TABS = [
  ["payroll", "Payroll"],
  ["time", "Time record"],
  ["thirteenth", "13th month"],
  ["staff", "Staff"],
] as const;

const BUSINESS = "Mang Kiko's Cacao";
const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
};

/** Who belongs on a period's sheet: everyone working, plus anyone since let go who has days or pay in it. */
function peopleFor(staff: StaffMember[], has: (s: StaffMember) => boolean): StaffMember[] {
  return staff.filter((s) => s.active || has(s)).sort((a, b) => a.name.localeCompare(b.name));
}

export function SalariesScreen() {
  const [tab, setTab] = useState<Tab>("payroll");
  return (
    <Page title="Salaries" subnav={<PageTabs tabs={TABS} value={tab} onChange={setTab} />}>
      {tab === "payroll" && <PayrollView />}
      {tab === "time" && <TimeView />}
      {tab === "thirteenth" && <ThirteenthView />}
      {tab === "staff" && <StaffList />}
    </Page>
  );
}

function payLines(line: PayLine): { label: string; amount: number }[] {
  const s = line.staff;
  const lines =
    s.payType === "daily"
      ? [{ label: `${line.fullDays + line.halfDays / 2} days × ${formatPeso(s.rate)}${line.halfDays ? ` (${pluralize(line.halfDays, "half day")})` : ""}`, amount: line.basic }]
      : [{ label: `Half of ${formatPeso(s.rate)} a month`, amount: line.basic }];
  if (line.overtime > 0) lines.push({ label: `Overtime, ${line.otHours} h at 125%`, amount: line.overtime });
  return lines;
}

function PeriodNav({ period, onShift, today }: { period: ReturnType<typeof periodFor>; onShift: (n: number) => void; today: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <CarouselNav label={period.label} onPrev={() => onShift(-1)} onNext={() => onShift(1)} labelWidth="w-[170px]" />
      <span className="text-[13px] text-muted-foreground">
        Payday {fmtDay(period.payday)}
        {period.payday === today ? " — today" : ""}
      </span>
    </div>
  );
}

function PayrollView() {
  const { staff, timeRecords, payroll } = useStore();
  const today = manilaToday();
  const [period, setPeriod] = useState(() => periodFor(today));
  const [paying, setPaying] = useState<{ line: PayLine; breakdown: PayBreakdown } | null>(null);

  const people = peopleFor(staff, (s) => timeRecords.some((r) => r.staffId === s.id && r.date >= period.start && r.date <= period.end));
  const lines = people.map((s) => payFor(s, period, timeRecords, payroll));
  const total = lines.reduce((n, l) => n + (l.paid ? l.paid.net : l.gross), 0);
  const unpaid = lines.filter((l) => !l.paid && l.gross > 0);
  const waitingOt = lines.reduce((n, l) => n + l.unapprovedExtra, 0);

  function slip(line: PayLine, paid: PayrollRecord) {
    printPayslip({
      business: BUSINESS,
      name: line.staff.name,
      position: line.staff.position,
      period: period.label,
      lines: payLines(line),
      deductions: paid.deductions,
      deductionNote: paid.deductionNote,
      net: paid.net,
      paidOn: paid.paidOn,
    });
  }

  if (staff.length === 0) return <NoStaffYet />;

  return (
    <div className="flex max-w-[1000px] flex-col gap-4">
      <PeriodNav period={period} onShift={(n) => setPeriod((p) => shiftPeriod(p, n))} today={today} />

      <div className="flex flex-wrap gap-3">
        <div className="rounded-2xl border border-line/15 bg-card px-4 py-3">
          <p className="text-[12px] font-semibold text-muted-foreground">Total this payday</p>
          <p className="font-display text-[24px] font-bold tabular-nums">{formatPeso(total)}</p>
        </div>
        <div className="rounded-2xl border border-line/15 bg-card px-4 py-3">
          <p className="text-[12px] font-semibold text-muted-foreground">Still to pay</p>
          <p className={`font-display text-[24px] font-bold tabular-nums ${unpaid.length ? "text-[var(--status-warning)]" : "text-success"}`}>
            {unpaid.length ? pluralize(unpaid.length, "person", "people") : "Everyone paid"}
          </p>
        </div>
      </div>
      {waitingOt > 0 && (
        <p className="rounded-xl bg-[var(--status-warning)]/10 px-3 py-2 text-[13px] font-semibold text-[var(--status-warning)]">
          {waitingOt} hours past a full day on the clock aren&apos;t approved as overtime yet, so they aren&apos;t paid. Approve them on the Time record.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line/15 bg-card">
        <table className="w-full min-w-[760px] border-collapse text-[14px]">
          <thead>
            <tr className="text-left text-[12px] text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Rate</th>
              <th className="px-3 py-2 text-center font-semibold">Days worked</th>
              <th className="px-3 py-2 text-center font-semibold">Overtime</th>
              <th className="px-3 py-2 text-right font-semibold">Basic</th>
              <th className="px-3 py-2 text-right font-semibold">OT pay</th>
              <th className="px-3 py-2 text-right font-semibold">To pay</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.staff.id} className="border-t border-line/10 even:bg-secondary/30">
                <td className="px-3 py-2.5 font-semibold">
                  {line.staff.name}
                  {line.staff.pwd && <Pill tone="brand" className="ml-1.5">PWD</Pill>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{rateLabel(line.staff)}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">
                  {line.staff.payType === "monthly" ? (
                    <span className="text-muted-foreground">{line.fullDays + line.halfDays / 2 || "—"} · monthly</span>
                  ) : (
                    <>
                      {line.fullDays + line.halfDays / 2}
                      {line.halfDays > 0 && <span className="text-[12px] text-muted-foreground"> ({line.halfDays} half)</span>}
                    </>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums">
                  {line.otHours ? `${line.otHours} h` : "—"}
                  {line.unapprovedExtra > 0 && <span className="block text-[11px] font-semibold text-[var(--status-warning)]">+{line.unapprovedExtra} h to approve</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatPeso(line.basic)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{line.overtime ? formatPeso(line.overtime) : "—"}</td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                  {formatPeso(line.paid ? line.paid.net : line.gross)}
                  {line.paid && line.paid.deductions > 0 && <span className="block text-[11px] font-normal text-muted-foreground">less {formatPeso(line.paid.deductions)}</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {line.paid ? (
                    <span className="inline-flex items-center gap-1">
                      <Pill tone="good">Paid {fmtDay(line.paid.paidOn)}</Pill>
                      <IconButton label="Print payslip" onClick={() => slip(line, line.paid!)}>
                        <Printer className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="Undo this payment"
                        onClick={() => {
                          if (window.confirm(`Undo ${line.staff.name}'s payment? The salary expense comes out of Transactions too.`)) undoSalaryPayment(line.paid!.id);
                        }}
                      >
                        <Undo2 className="h-4 w-4" />
                      </IconButton>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={line.gross <= 0}
                      onClick={() =>
                        setPaying({
                          line,
                          breakdown: { title: `Pay for ${period.label}`, lines: payLines(line), gross: line.gross, defaultDate: today < period.payday ? today : period.payday },
                        })
                      }
                      className="min-h-10 rounded-[10px] bg-cacao px-4 text-[13px] font-semibold text-ivory disabled:opacity-30"
                    >
                      Pay
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        Daily-rate staff: days on the time record × rate (half days at half). Monthly staff: half the monthly rate each payday, whatever the absences.
        Overtime: approved hours at 125%. No SSS, PhilHealth or Pag-IBIG is taken off.
      </p>

      {paying && (
        <PayDialog
          member={paying.line.staff}
          breakdown={paying.breakdown}
          onClose={() => setPaying(null)}
          onPay={(p) => {
            const line = paying.line;
            recordSalaryPayment(
              { staffId: line.staff.id, kind: "regular", periodStart: period.start, periodEnd: period.end, basic: line.basic, overtime: line.overtime, ...p },
              line.staff.name,
              `Salary — ${period.label}`,
            );
            setPaying(null);
          }}
        />
      )}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/20 text-muted-foreground hover:bg-secondary">
      {children}
    </button>
  );
}

function NoStaffYet() {
  return (
    <p className="max-w-[760px] rounded-2xl border border-line/15 bg-card px-4 py-8 text-center text-[14px] text-muted-foreground">
      Add the people you pay under <span className="font-semibold text-foreground">Staff</span> first — with their monthly or daily rate.
    </p>
  );
}

function TimeView() {
  const { staff, timeRecords } = useStore();
  const today = manilaToday();
  const [period, setPeriod] = useState(() => periodFor(today));
  const people = peopleFor(staff, (s) => timeRecords.some((r) => r.staffId === s.id && r.date >= period.start && r.date <= period.end));
  if (staff.length === 0) return <NoStaffYet />;
  return (
    <div className="flex max-w-[1000px] flex-col gap-8">
      <TimeInPanel />
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[20px] font-semibold">Daily time record</h2>
        <PeriodNav period={period} onShift={(n) => setPeriod((p) => shiftPeriod(p, n))} today={today} />
        <TimeRecordGrid period={period} people={people} />
      </section>
    </div>
  );
}

function ThirteenthView() {
  const { staff, timeRecords, payroll } = useStore();
  const today = manilaToday();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [paying, setPaying] = useState<ThirteenthMonth | null>(null);
  const asOf = year < Number(today.slice(0, 4)) ? `${year}-12-31` : today;

  const rows = useMemo(
    () =>
      peopleFor(staff, (s) => payroll.some((p) => p.staffId === s.id && p.periodStart.startsWith(String(year)))).map((s) =>
        thirteenthMonth(s, year, asOf, timeRecords, payroll),
      ),
    [staff, payroll, timeRecords, year, asOf],
  );
  const due = `${year}-12-24`;
  const daysToDue = Math.round((new Date(year, 11, 24).getTime() - new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10))).getTime()) / 86_400_000);

  if (staff.length === 0) return <NoStaffYet />;
  return (
    <div className="flex max-w-[900px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <CarouselNav label={String(year)} onPrev={() => setYear((y) => y - 1)} onNext={() => setYear((y) => y + 1)} labelWidth="w-[90px]" />
        <span className={`text-[13px] font-semibold ${daysToDue >= 0 && daysToDue <= 30 ? "text-[var(--status-warning)]" : "text-muted-foreground"}`}>
          Due on or before Dec 24{daysToDue >= 0 ? ` — ${pluralize(daysToDue, "day")} from now` : ""}
        </span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line/15 bg-card">
        <table className="w-full min-w-[640px] border-collapse text-[14px]">
          <thead>
            <tr className="text-left text-[12px] text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 text-right font-semibold">Basic pay this year</th>
              <th className="px-3 py-2 text-right font-semibold">13th month so far</th>
              <th className="px-3 py-2 text-right font-semibold">By December</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.staff.id} className="border-t border-line/10 even:bg-secondary/30">
                <td className="px-3 py-2.5 font-semibold">
                  {r.staff.name}
                  <span className="block text-[12px] font-normal text-muted-foreground">{rateLabel(r.staff)}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatPeso(r.basicSoFar)}</td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums">{formatPeso(r.soFar)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatPeso(r.projected)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {r.paid ? (
                    <span className="inline-flex items-center gap-1">
                      <Pill tone="good">Paid {formatPeso(r.paid.net)} on {fmtDay(r.paid.paidOn)}</Pill>
                      <IconButton
                        label="Undo this payment"
                        onClick={() => {
                          if (window.confirm(`Undo ${r.staff.name}'s 13th month payment? The expense comes out of Transactions too.`)) undoSalaryPayment(r.paid!.id);
                        }}
                      >
                        <Undo2 className="h-4 w-4" />
                      </IconButton>
                    </span>
                  ) : (
                    <button type="button" disabled={r.soFar <= 0} onClick={() => setPaying(r)} className="min-h-10 rounded-[10px] bg-cacao px-4 text-[13px] font-semibold text-ivory disabled:opacity-30">
                      Pay
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        13th month pay = the basic pay earned in {year} ÷ 12 (overtime isn&apos;t counted). &ldquo;By December&rdquo; assumes each person keeps working as they have so far.
        Paying it records it in Transactions as a salary expense.
      </p>

      {paying && (
        <PayDialog
          member={paying.staff}
          breakdown={{
            title: `13th month pay for ${year}`,
            lines: [{ label: `${formatPeso(paying.basicSoFar)} basic pay ÷ 12`, amount: paying.soFar }],
            gross: paying.soFar,
            defaultDate: today < due ? today : due,
          }}
          onClose={() => setPaying(null)}
          onPay={(p) => {
            recordSalaryPayment(
              { staffId: paying.staff.id, kind: "13th", periodStart: `${year}-01-01`, periodEnd: `${year}-12-31`, basic: paying.soFar, overtime: 0, ...p },
              paying.staff.name,
              `13th month pay — ${year}`,
            );
            setPaying(null);
          }}
        />
      )}
    </div>
  );
}
