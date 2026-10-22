"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { CarouselNav } from "@/components/ui/carousel-nav";
import { Pill } from "@/components/ui/kit";
import { useStore } from "@/lib/store/use-store";
import { recordRemittance, setBusinessSetting, undoSalaryPayment } from "@/lib/store/store";
import { formatPeso } from "@/lib/format";
import { manilaToday, payFor, periodFor } from "@/lib/payroll/pay";
import { AGENCY_LABELS, CONTRIBUTIONS_FROM_KEY, type Agency } from "@/lib/payroll/contributions";
import { useContributionsFrom } from "@/lib/payroll/use-contributions-from";

/**
 * SSS, PhilHealth and Pag-IBIG for a month: each person's share (taken from their end-of-month
 * pay) and the shop's share, and what goes to each agency. Recording a payment to an agency
 * adds it to Transactions as an expense. The shop's start date for deductions is set here.
 */

const AGENCIES: Agency[] = ["sss", "philhealth", "pagibig"];
const DUE: Record<Agency, string> = {
  sss: "Due by the end of the next month",
  philhealth: "Due mid next month (by your employer number's schedule)",
  pagibig: "Due mid next month (by your employer name's schedule)",
};

const monthLabel = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
const shiftMonth = (ym: string, n: number) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function ContributionsView() {
  const { staff, timeRecords, payroll } = useStore();
  const from = useContributionsFrom();
  const today = manilaToday();
  // Early in a month, last month's are the ones to send.
  const [month, setMonth] = useState(() => (Number(today.slice(8, 10)) <= 20 ? shiftMonth(today.slice(0, 7), -1) : today.slice(0, 7)));
  const [editingFrom, setEditingFrom] = useState(false);
  const [fromDraft, setFromDraft] = useState(from);

  const period = periodFor(`${month}-20`);
  const rows = staff
    .filter((s) => !s.allowanceOnly)
    .map((s) => ({ s, line: payFor(s, period, timeRecords, payroll, { contributionsFrom: from }) }))
    .filter(({ s, line }) => line.contributions && (s.active || line.gross > 0));
  const total = (a: Agency, who: "employee" | "employer") => rows.reduce((n, { line }) => n + (line.contributions?.[a][who] ?? 0), 0);
  const sent = (a: Agency) => payroll.find((p) => p.kind === "remittance" && p.staffId === a && p.periodStart === `${month}-01`);
  const started = period.end >= from;

  return (
    <div className="flex max-w-[1000px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <CarouselNav label={monthLabel(month)} onPrev={() => setMonth((m) => shiftMonth(m, -1))} onNext={() => setMonth((m) => shiftMonth(m, 1))} labelWidth="w-[160px]" />
        <span className="text-[13px] text-muted-foreground">
          Deductions start {monthLabel(from.slice(0, 7))}
          {!editingFrom && (
            <button type="button" onClick={() => setEditingFrom(true)} className="ml-2 font-semibold text-cacao underline-offset-2 hover:underline">
              Change
            </button>
          )}
        </span>
        {editingFrom && (
          <span className="flex items-center gap-2">
            <input type="month" value={fromDraft.slice(0, 7)} onChange={(e) => setFromDraft(`${e.target.value}-01`)} className="h-10 rounded-lg border border-input bg-transparent px-2 text-[14px]" />
            <button
              type="button"
              onClick={() => {
                if (/^\d{4}-\d{2}-01$/.test(fromDraft)) setBusinessSetting(CONTRIBUTIONS_FROM_KEY, fromDraft);
                setEditingFrom(false);
              }}
              className="min-h-10 rounded-[10px] bg-cacao px-3 text-[13px] font-semibold text-ivory"
            >
              Save
            </button>
          </span>
        )}
      </div>

      {!started ? (
        <p className="rounded-2xl border border-line/15 bg-card px-4 py-8 text-center text-[14px] text-muted-foreground">
          Nothing is deducted for {monthLabel(month)} — SSS, PhilHealth and Pag-IBIG start in {monthLabel(from.slice(0, 7))}.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-line/15 bg-card px-4 py-8 text-center text-[14px] text-muted-foreground">No one was paid a salary in {monthLabel(month)}.</p>
      ) : (
        <>
          <div className="grid gap-3 min-[760px]:grid-cols-3">
            {AGENCIES.map((a) => {
              const ee = total(a, "employee");
              const er = total(a, "employer");
              const done = sent(a);
              return (
                <div key={a} className="flex flex-col gap-2 rounded-2xl border border-line/15 bg-card p-4">
                  <p className="text-[13px] font-semibold text-muted-foreground">{AGENCY_LABELS[a]}</p>
                  <p className="font-display text-[24px] font-bold tabular-nums">{formatPeso(ee + er)}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    Workers {formatPeso(ee)} + shop {formatPeso(er)}
                  </p>
                  {done ? (
                    <span className="flex items-center gap-1.5">
                      <Pill tone="good">
                        Sent {formatPeso(done.net)} on {done.paidOn}
                      </Pill>
                      <button
                        type="button"
                        aria-label="Undo"
                        title="Undo"
                        onClick={() => window.confirm(`Undo the ${AGENCY_LABELS[a]} payment? It comes out of Transactions too.`) && undoSalaryPayment(done.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-line/20 text-muted-foreground hover:bg-secondary"
                      >
                        <Undo2 className="h-4 w-4" />
                      </button>
                    </span>
                  ) : (
                    <>
                      <p className="text-[12px] text-[var(--status-warning)]">{DUE[a]}</p>
                      <button
                        type="button"
                        onClick={() => window.confirm(`Record ${formatPeso(ee + er)} paid to ${AGENCY_LABELS[a]} today for ${monthLabel(month)}?`) && recordRemittance(a, AGENCY_LABELS[a], month, Math.round((ee + er) * 100) / 100, today)}
                        className="min-h-10 rounded-[10px] bg-cacao px-4 text-[13px] font-semibold text-ivory"
                      >
                        Record payment to {AGENCY_LABELS[a]}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-line/15 bg-card">
            <table className="w-full min-w-[760px] border-collapse text-[14px]">
              <thead>
                <tr className="text-[12px] text-muted-foreground">
                  <th rowSpan={2} className="px-3 py-2 text-left font-semibold">
                    Name
                  </th>
                  <th rowSpan={2} className="px-3 py-2 text-right font-semibold">
                    Month&apos;s pay
                  </th>
                  {AGENCIES.map((a) => (
                    <th key={a} colSpan={2} className="border-l border-line/10 px-3 pt-2 text-center font-semibold">
                      {AGENCY_LABELS[a]}
                    </th>
                  ))}
                </tr>
                <tr className="text-[11px] text-muted-foreground">
                  {AGENCIES.map((a) => (
                    <FragmentHead key={a} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, line }) => {
                  const c = line.contributions!;
                  const first = payFor(s, periodFor(`${month}-01`), timeRecords);
                  return (
                    <tr key={s.id} className="border-t border-line/10 even:bg-secondary/30">
                      <td className="px-3 py-2.5 font-semibold">{s.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatPeso(first.gross + line.gross)}</td>
                      {AGENCIES.map((a) => (
                        <Cells key={a} worker={c[a].employee} shop={c[a].employer} />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            Worked out from the month&apos;s pay, at 2026 rates: SSS 5% from the worker and 10% (plus ₱10–₱30 EC) from the shop, on pay rounded to ₱500 between
            ₱5,000 and ₱35,000; PhilHealth 5% of basic pay, half each; Pag-IBIG 2% each, up to ₱200. Check the rates with each agency every January.
          </p>
        </>
      )}
    </div>
  );
}

function FragmentHead() {
  return (
    <>
      <th className="border-l border-line/10 px-2 pb-2 text-right font-medium">Worker</th>
      <th className="px-2 pb-2 text-right font-medium">Shop</th>
    </>
  );
}

function Cells({ worker, shop }: { worker: number; shop: number }) {
  return (
    <>
      <td className="border-l border-line/10 px-2 py-2.5 text-right tabular-nums">{formatPeso(worker)}</td>
      <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{formatPeso(shop)}</td>
    </>
  );
}
