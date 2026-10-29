"use client";

import { useState } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store/use-store";
import { useCurrentUser } from "@/lib/auth/current-user";
import { useContributionsFrom } from "@/lib/payroll/use-contributions-from";
import { manilaToday, periodFor, shiftPeriod } from "@/lib/payroll/pay";
import { buildPayrollReport, periodsFor } from "@/lib/reports/payroll-report";
import { downloadCsv, downloadPdf } from "@/lib/reports/render";

/**
 * The "Download payroll report" button's window on Salaries: one payday or a whole month, as a
 * PDF to print and sign, or a spreadsheet. For Sandy to check on paper.
 */
export function PayrollReportDialog({ onClose }: { onClose: () => void }) {
  const { staff, timeRecords, payroll } = useStore();
  const me = useCurrentUser();
  const contributionsFrom = useContributionsFrom();
  const today = manilaToday();
  const current = periodFor(today);
  const choices = [current, shiftPeriod(current, -1), shiftPeriod(current, -2), shiftPeriod(current, -3)];
  const [kind, setKind] = useState<"period" | "month">("period");
  const [periodStart, setPeriodStart] = useState(current.start);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);

  function build() {
    const periods = kind === "period" ? periodsFor({ kind: "period", day: periodStart }) : periodsFor({ kind: "month", month });
    const label = kind === "period" ? `Pay period ${periods[0].label} · payday ${periods[0].payday}` : new Date(`${month}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
    return { report: buildPayrollReport(staff, timeRecords, payroll, periods, contributionsFrom, label), name: `MKC payroll ${kind === "period" ? periods[0].start : month}` };
  }

  async function download(type: "pdf" | "csv") {
    setBusy(type);
    const { report, name } = build();
    if (type === "pdf") await downloadPdf(report, `${name}.pdf`, { landscape: true, preparedBy: me?.name, signatures: ["Prepared by", "Checked and approved by (Executive)"] });
    else downloadCsv(report, `${name}.csv`);
    setBusy(null);
  }

  const field = "h-11 rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Download the payroll report</DialogTitle>
          <DialogDescription>Each person&apos;s days, overtime, deductions and take-home pay, with totals and lines to sign.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          {(
            [
              ["period", "One payday"],
              ["month", "A whole month"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setKind(v)} className={`min-h-10 flex-1 rounded-lg border text-[14px] font-semibold ${kind === v ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card"}`}>
              {l}
            </button>
          ))}
        </div>
        {kind === "period" ? (
          <select value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={field} aria-label="Pay period">
            {choices.map((p) => (
              <option key={p.start} value={p.start}>
                {p.label} · payday {p.payday}
              </option>
            ))}
          </select>
        ) : (
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={field} aria-label="Month" />
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy !== null} onClick={() => void download("pdf")} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-cacao px-4 text-[14px] font-semibold text-ivory disabled:opacity-50">
            <FileDown className="h-4 w-4" />
            {busy === "pdf" ? "Making it…" : "Download PDF (to print)"}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void download("csv")} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold disabled:opacity-50">
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
