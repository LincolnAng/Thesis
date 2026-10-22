"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPeso } from "@/lib/format";
import type { StaffMember } from "@/lib/store/types";

/**
 * Confirming a payment before it's recorded: what it's made of, anything taken off (a cash
 * advance), the date, and what they take home. Saving records the payslip and a salary expense
 * in Transactions together.
 */

export interface PayBreakdown {
  title: string;
  /** Label / amount lines that add up to the gross. */
  lines: { label: string; amount: number }[];
  gross: number;
  defaultDate: string;
}

export function PayDialog({
  member,
  breakdown,
  onClose,
  onPay,
}: {
  member: StaffMember;
  breakdown: PayBreakdown;
  onClose: () => void;
  onPay: (p: { paidOn: string; deductions: number; deductionNote: string; net: number }) => void;
}) {
  const [paidOn, setPaidOn] = useState(breakdown.defaultDate);
  const [less, setLess] = useState("");
  const [note, setNote] = useState("");
  const deductions = Math.min(breakdown.gross, Number(less) || 0);
  const net = Math.round((breakdown.gross - deductions) * 100) / 100;
  const field = "h-11 rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {member.name}</DialogTitle>
          <DialogDescription>{breakdown.title}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-1 rounded-xl bg-secondary/60 px-3 py-2.5 text-[14px]">
          {breakdown.lines.map((l) => (
            <li key={l.label} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{l.label}</span>
              <span className="tabular-nums">{formatPeso(l.amount)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 border-t border-line/15 pt-1 font-semibold">
            <span>Gross pay</span>
            <span className="tabular-nums">{formatPeso(breakdown.gross)}</span>
          </li>
        </ul>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            Less (₱)
            <input inputMode="decimal" value={less} onChange={(e) => setLess(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className={`${field} text-right`} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            For
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cash advance" className={field} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-[13px] font-semibold">
            Paid on
            <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={field} />
          </label>
        </div>

        <div className="flex items-baseline justify-between rounded-xl border border-cacao/30 bg-cacao/5 px-3 py-2.5">
          <span className="text-[14px] font-semibold">Take-home pay</span>
          <span className="font-display text-[22px] font-bold tabular-nums text-cacao">{formatPeso(net)}</span>
        </div>
        <p className="text-[12px] text-muted-foreground">Recorded in Transactions as a salary expense, paid in cash. No SSS, PhilHealth or Pag-IBIG is taken off.</p>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!paidOn || net <= 0}
            onClick={() => onPay({ paidOn, deductions, deductionNote: note.trim(), net })}
            className="min-h-11 flex-1 rounded-[10px] bg-cacao text-[14px] font-semibold text-ivory disabled:opacity-40"
          >
            Record payment of {formatPeso(net)}
          </button>
          <button type="button" onClick={onClose} className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold">
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Opens a plain payslip in a new window and prints it. */
export function printPayslip(p: {
  business: string;
  name: string;
  position: string;
  period: string;
  lines: { label: string; amount: number }[];
  deductions: number;
  deductionNote: string;
  net: number;
  paidOn: string;
}) {
  const w = window.open("", "_blank", "width=480,height=640");
  if (!w) return;
  const row = (label: string, amount: string, bold = false) =>
    `<tr${bold ? ' style="font-weight:700;border-top:1px solid #999"' : ""}><td>${esc(label)}</td><td style="text-align:right">${amount}</td></tr>`;
  const gross = p.lines.reduce((s, l) => s + l.amount, 0);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Payslip — ${esc(p.name)}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#222}table{width:100%;border-collapse:collapse;margin-top:12px}td{padding:6px 0}h1{font-size:18px;margin:0}p{margin:2px 0;color:#555}.sign{margin-top:48px;display:flex;justify-content:space-between;gap:24px}.sign div{flex:1;border-top:1px solid #333;padding-top:4px;font-size:12px;text-align:center}</style>
</head><body><h1>${esc(p.business)} — Payslip</h1><p>${esc(p.name)}${p.position ? ` · ${esc(p.position)}` : ""}</p><p>${esc(p.period)} · paid ${esc(p.paidOn)}</p>
<table>${p.lines.map((l) => row(l.label, formatPeso(l.amount))).join("")}${row("Gross pay", formatPeso(gross), true)}${
    p.deductions > 0 ? row(`Less${p.deductionNote ? ` — ${p.deductionNote}` : ""}`, `−${formatPeso(p.deductions)}`) : ""
  }${row("Take-home pay", formatPeso(p.net), true)}</table>
<div class="sign"><div>Released by</div><div>Received by ${esc(p.name)}</div></div>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}
