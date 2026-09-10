/**
 * CSV export. The assistant has been promising this since before it existed.
 *
 * Values are quoted whenever they contain a delimiter, quote or newline, because a product
 * called "Classic Cocoa Spread, 250ml" would otherwise silently split into two columns and
 * shift every value after it.
 */
function escapeCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [headers.map(escapeCell).join(","), ...rows.map((r) => r.map(escapeCell).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  // A BOM so Excel opens peso signs and Filipino characters as UTF-8 rather than mojibake.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
