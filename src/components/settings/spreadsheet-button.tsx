"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileDown } from "lucide-react";

/**
 * A way out to the spreadsheet from wherever the numbers are being read.
 *
 * The owner's office runs on Microsoft, not Google Workspace, so "open the sheet" isn't the
 * whole answer — the second button hands back a real .xlsx that opens in Excel. The address
 * only exists on the server (it's built from the spreadsheet id in the environment), so it's
 * fetched once and shared by every button on the page.
 */

let pending: Promise<string | null> | null = null;

function fetchUrl(): Promise<string | null> {
  pending ??= fetch("/api/settings")
    .then((r) => (r.ok ? r.json() : null))
    .then((json: { spreadsheetUrl?: string | null } | null) => json?.spreadsheetUrl ?? null)
    .catch(() => null);
  return pending;
}

export function useSpreadsheetUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchUrl().then((value) => {
      if (!cancelled) setUrl(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return url;
}

/** Google serves any sheet as a real Excel workbook from its own address. */
function excelUrl(url: string): string {
  return url.replace(/\/edit.*$/, "") + "/export?format=xlsx";
}

/** `excel` adds the .xlsx download beside it — wanted in Settings, too much for a header. */
export function SpreadsheetButton({ excel = false }: { excel?: boolean }) {
  const url = useSpreadsheetUrl();
  if (!url) return null;

  return (
    <>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-[10px] border border-line/20 bg-white px-4 py-2.5 text-[13px] font-semibold"
      >
        Google Sheet <ExternalLink className="h-3.5 w-3.5" />
      </a>
      {excel && (
        <a
          href={excelUrl(url)}
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-line/20 bg-white px-4 py-2.5 text-[13px] font-semibold"
          title="Downloads the whole thing as an Excel file"
        >
          <FileDown className="h-3.5 w-3.5" /> Excel
        </a>
      )}
    </>
  );
}
