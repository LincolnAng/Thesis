"use client";

import type { Table } from "@/lib/reports/sales-report";

/**
 * Turns a report (lib/reports/sales-report, payroll-report) into a file to download: a PDF laid
 * out like an ordinary printed report — business name, title and period, a summary box, then
 * tables with totals — or a CSV that Excel opens. Amounts are written "PHP 1,250.00" in the PDF,
 * since the standard PDF fonts have no peso sign.
 */

export interface PrintableReport {
  title: string;
  subtitle: string;
  summary: { label: string; value: number; note?: string }[];
  /** The summary box's heading — "Executive summary" on the sales report. */
  summaryTitle?: string;
  highlights: string[];
  tables: Table[];
}

const BUSINESS = "Mang Kiko's Cacao";
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell = (v: string | number, isMoney: boolean) => (typeof v === "number" ? (isMoney ? money(v) : String(Math.round(v * 100) / 100)) : v);

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadPdf(report: PrintableReport, fileName: string, opts: { landscape?: boolean; preparedBy?: string; signatures?: string[] } = {}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: opts.landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 40;
  const brown: [number, number, number] = [91, 58, 34];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...brown);
  doc.text(BUSINESS.toUpperCase(), margin, 46);
  doc.setFontSize(20);
  doc.setTextColor(20, 20, 20);
  doc.text(report.title, margin, 70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text(report.subtitle, margin, 88);
  const generated = new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
  doc.text(`Generated ${generated}${opts.preparedBy ? ` by ${opts.preparedBy}` : ""}`, width - margin, 88, { align: "right" });

  // Summary
  let y = 104;
  if (report.summary.length) {
    autoTable(doc, {
      startY: y,
      head: [[report.summaryTitle ?? "Summary", "Amount (PHP)", ""]],
      body: report.summary.map((s) => [s.label, money(s.value), s.note ?? ""]),
      theme: "grid",
      headStyles: { fillColor: brown, textColor: 255, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" }, 2: { textColor: [110, 110, 110], fontSize: 9 } },
      styles: { fontSize: 10, cellPadding: 5 },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }
  if (report.highlights.length) {
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    for (const line of report.highlights) {
      const wrapped = doc.splitTextToSize(`• ${line}`, width - margin * 2);
      doc.text(wrapped, margin, y);
      y += 14 * wrapped.length;
    }
    y += 6;
  }

  for (const t of report.tables) {
    const moneyCols = new Set(t.money ?? []);
    if (y > doc.internal.pageSize.getHeight() - 100) {
      doc.addPage();
      y = 50;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text(t.title, margin, y);
    autoTable(doc, {
      startY: y + 6,
      head: [t.head],
      body: t.rows.length ? t.rows.map((r) => r.map((v, i) => cell(v, moneyCols.has(i)))) : [[{ content: "Nothing recorded.", colSpan: t.head.length }]],
      foot: t.total && t.rows.length ? [t.total.map((v, i) => cell(v, moneyCols.has(i)))] : undefined,
      theme: "striped",
      headStyles: { fillColor: [240, 234, 226], textColor: 30, fontStyle: "bold" },
      footStyles: { fillColor: [240, 234, 226], textColor: 20, fontStyle: "bold" },
      columnStyles: Object.fromEntries([...moneyCols].map((i) => [i, { halign: "right" }])),
      // Amounts line up on the right in the heading and the total too, not only the rows.
      didParseCell: (d) => {
        if (moneyCols.has(d.column.index)) d.cell.styles.halign = "right";
      },
      styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  }

  if (opts.signatures?.length) {
    if (y > doc.internal.pageSize.getHeight() - 90) {
      doc.addPage();
      y = 80;
    }
    y += 30;
    const span = (width - margin * 2) / opts.signatures.length;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    opts.signatures.forEach((label, i) => {
      const x = margin + i * span;
      doc.line(x + 10, y, x + span - 20, y);
      doc.text(label, x + 10, y + 14);
    });
  }

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`${BUSINESS} · ${report.title} · ${report.subtitle} · page ${i} of ${pages}`, width / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });
  }
  save(doc.output("blob"), fileName);
}

const csvCell = (v: string | number) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** A CSV with every section one after another — opens in Excel or Google Sheets. */
export function downloadCsv(report: PrintableReport, fileName: string) {
  const lines: string[] = [];
  lines.push(csvCell(`${BUSINESS} — ${report.title}`));
  lines.push(csvCell(report.subtitle));
  lines.push("");
  if (report.summary.length) {
    lines.push("Summary,Amount (PHP),Note");
    for (const s of report.summary) lines.push([s.label, s.value.toFixed(2), s.note ?? ""].map(csvCell).join(","));
    lines.push("");
  }
  for (const t of report.tables) {
    lines.push(csvCell(t.title));
    lines.push(t.head.map(csvCell).join(","));
    for (const r of t.rows) lines.push(r.map((v) => csvCell(typeof v === "number" ? Math.round(v * 100) / 100 : v)).join(","));
    if (t.total) lines.push(t.total.map((v) => csvCell(typeof v === "number" ? Math.round(v * 100) / 100 : v)).join(","));
    lines.push("");
  }
  // The byte-order mark makes Excel read the file as UTF-8 (names with ñ, the ₱ sign).
  save(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), fileName);
}
