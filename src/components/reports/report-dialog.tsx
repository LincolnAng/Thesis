"use client";

import { useState } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store/use-store";
import { isAdmin, isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { buildSalesReport, REPORT_PARTS, type ReportPart } from "@/lib/reports/sales-report";
import { downloadCsv, downloadPdf } from "@/lib/reports/render";

/**
 * The "Download report" button's window on Transactions: pick the month (or a date range), tick
 * what goes in — sales, expenses, spoilage, waste, or all of it — and whether to list every entry,
 * then download it as a PDF to print or a spreadsheet for Excel.
 */

const pad = (n: number) => String(n).padStart(2, "0");
function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${pad(last)}`, label: new Date(y, m - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" }) };
}

export function ReportDialog({ defaultMonth, onClose }: { defaultMonth: string; onClose: () => void }) {
  const { entries, products } = useStore();
  const me = useCurrentUser();
  // The Admin sees what's owed too, as an Executive does.
  const exec = isExecutive(me) || isAdmin(me);
  const [range, setRange] = useState<"month" | "custom">("month");
  const [month, setMonth] = useState(defaultMonth);
  const [from, setFrom] = useState(monthRange(defaultMonth).from);
  const [to, setTo] = useState(monthRange(defaultMonth).to);
  const [parts, setParts] = useState<ReportPart[]>(REPORT_PARTS.map((p) => p.part));
  const [detail, setDetail] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = parts.length === REPORT_PARTS.length;
  const toggle = (p: ReportPart) => setParts((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  function build() {
    const period = range === "month" ? monthRange(month) : { from, to, label: `${from} to ${to}` };
    return buildSalesReport(entries, products, { ...period, parts, detail, showOwed: exec });
  }

  async function download(kind: "pdf" | "csv") {
    if (parts.length === 0) return setError("Tick at least one thing to include.");
    if (range === "custom" && (!from || !to || to < from)) return setError("Check the dates — the end can't be before the start.");
    setError(null);
    setBusy(kind);
    try {
      const report = build();
      const name = `MKC sales report ${range === "month" ? month : `${from} to ${to}`}`;
      if (kind === "pdf") await downloadPdf(report, `${name}.pdf`, { landscape: detail, preparedBy: me?.name, signatures: ["Prepared by", "Checked by"] });
      else downloadCsv(report, `${name}.csv`);
    } catch {
      setError("The file couldn't be made. Try again.");
    }
    setBusy(null);
  }

  const field = "h-11 rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Download a sales & expense report</DialogTitle>
          <DialogDescription>A summary on top, then what you tick. Ready to print, or open in Excel.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">For</span>
          <div className="flex gap-2">
            {(
              [
                ["month", "A month"],
                ["custom", "Dates I choose"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setRange(v)} className={`min-h-10 flex-1 rounded-lg border text-[14px] font-semibold ${range === v ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card"}`}>
                {l}
              </button>
            ))}
          </div>
          {range === "month" ? (
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={field} aria-label="Month" />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} aria-label="From" />
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={field} aria-label="To" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">Include</span>
          <label className="flex min-h-10 items-center gap-2.5 text-[14px] font-semibold">
            <input type="checkbox" checked={all} onChange={() => setParts(all ? [] : REPORT_PARTS.map((p) => p.part))} className="h-5 w-5" />
            All
          </label>
          {REPORT_PARTS.map(({ part, label }) => (
            <label key={part} className="flex min-h-10 items-center gap-2.5 pl-4 text-[14px]">
              <input type="checkbox" checked={parts.includes(part)} onChange={() => toggle(part)} className="h-5 w-5" />
              {label}
            </label>
          ))}
          <label className="mt-1 flex min-h-10 items-start gap-2.5 rounded-lg bg-secondary/60 px-3 py-2 text-[14px]">
            <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} className="mt-0.5 h-5 w-5" />
            <span>
              List every entry too
              <span className="block text-[12px] text-muted-foreground">Each sale and expense on its own line, after the summaries.</span>
            </span>
          </label>
        </div>

        <p className="text-[12.5px] text-muted-foreground">
          The summary has sales, expenses, {exec ? "money in and out, " : ""}spoilage and waste for the period, how much of each product sold, the biggest expenses, and how sales compare with the period before.
        </p>

        {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
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
