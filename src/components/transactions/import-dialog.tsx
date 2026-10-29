"use client";

import { useMemo, useState } from "react";
import { FileUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store/use-store";
import { addEntryTracked } from "@/lib/store/store";
import { fullName } from "@/lib/summary/product-sizes";
import { formatPeso } from "@/lib/format";
import { draftFor, parseCsv, planImport, type ImportItem } from "@/lib/import/transactions-import";

/**
 * Bringing in the old spreadsheets (Executives and the Admin). Pick the CSV, look over what it
 * found — every sale order and expense, products matched by name, anything odd flagged, anything
 * already recorded set to skip — fix what needs fixing, and import. Imported rows are past
 * records: they show in Transactions and every total, but don't move today's stock.
 */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { products, entries } = useStore();
  const [items, setItems] = useState<ImportItem[] | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const productList = useMemo(() => products.map((p) => ({ id: p.id, name: fullName(p, products) })).sort((a, b) => a.name.localeCompare(b.name)), [products]);

  async function read(file: File | undefined) {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length === 0 || !("date" in rows[0]) || !("amount" in rows[0])) return setError("That file doesn't have the columns expected (date, type, item, … amount).");
      const plan = planImport(rows, products, entries);
      setItems(plan);
      setSkip(new Set(plan.filter((i) => i.duplicate).map((i) => i.key)));
    } catch {
      setError("That file couldn't be read. Save it as CSV and try again.");
    }
  }

  function setProduct(itemKey: string, rowNo: number, productId: string) {
    setItems((list) =>
      list ? list.map((it) => (it.key !== itemKey ? it : { ...it, lines: it.lines.map((l) => (l.rowNo === rowNo ? { ...l, productId: productId || null } : l)) })) : list,
    );
  }

  const chosen = (items ?? []).filter((i) => !skip.has(i.key));
  const sales = chosen.filter((i) => i.kind === "SALE");
  const spend = chosen.filter((i) => i.kind !== "SALE");
  const unmatched = sales.flatMap((i) => i.lines).filter((l) => !l.productId).length;

  async function run() {
    setProgress({ done: 0, total: chosen.length, failed: 0 });
    let done = 0;
    let failed = 0;
    // One at a time, so the sheet takes them in order and nothing is lost to a busy moment.
    for (const it of chosen) {
      const { saved } = addEntryTracked(draftFor(it, products));
      if (!(await saved)) failed += 1;
      done += 1;
      setProgress({ done, total: chosen.length, failed });
    }
  }

  const finished = progress && progress.done === progress.total;
  return (
    <Dialog open onOpenChange={(o) => !o && (!progress || finished) && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import from a spreadsheet</DialogTitle>
          <DialogDescription>Past sales and expenses, from a CSV file. They show in every total, but don&apos;t change today&apos;s stock.</DialogDescription>
        </DialogHeader>

        {!items && (
          <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line/25 text-[14px] font-semibold text-muted-foreground hover:border-cacao/50">
            <FileUp className="h-6 w-6" />
            Choose the CSV file
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void read(e.target.files?.[0])} />
          </label>
        )}
        {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}

        {items && (
          <>
            <p className="text-[14px]">
              <span className="font-semibold">{fileName}</span>: {sales.length} sale {sales.length === 1 ? "order" : "orders"} ({formatPeso(sales.reduce((n, i) => n + i.amount, 0))}) and {spend.length} expenses ({formatPeso(spend.reduce((n, i) => n + i.amount, 0))}) to import
              {skip.size > 0 ? ` · ${skip.size} skipped` : ""}.
              {unmatched > 0 && <span className="font-semibold text-[var(--status-warning)]"> {unmatched} product {unmatched === 1 ? "line isn't" : "lines aren't"} matched — pick the product, or leave it to keep the name only.</span>}
            </p>
            <div className="max-h-[52svh] overflow-auto rounded-xl border border-line/15">
              <table className="w-full min-w-[820px] border-collapse text-[13px]">
                <thead className="sticky top-0 bg-secondary text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {["Import", "Date", "Kind", "Who", "Items", "Paid by", "Amount"].map((h) => (
                      <th key={h} className="px-2.5 py-2 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.key} className={`border-t border-line/10 align-top ${skip.has(it.key) ? "opacity-45" : ""}`}>
                      <td className="px-2.5 py-2">
                        <input
                          type="checkbox"
                          checked={!skip.has(it.key)}
                          onChange={() => setSkip((s) => {
                            const n = new Set(s);
                            if (n.has(it.key)) n.delete(it.key);
                            else n.add(it.key);
                            return n;
                          })}
                          aria-label="Import this one"
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2">{it.date}</td>
                      <td className="px-2.5 py-2">{it.kind === "SALE" ? "Sale" : it.kind === "ASSET" ? "Asset" : `Expense · ${it.category}`}</td>
                      <td className="px-2.5 py-2">{it.party ?? "—"}</td>
                      <td className="px-2.5 py-2">
                        {it.lines.map((l) => (
                          <div key={l.rowNo} className="flex flex-wrap items-center gap-1.5 py-0.5">
                            {it.kind === "SALE" ? (
                              <>
                                <span className="tabular-nums">{l.quantity} ×</span>
                                <select
                                  value={l.productId ?? ""}
                                  onChange={(e) => setProduct(it.key, l.rowNo, e.target.value)}
                                  className={`h-8 max-w-[220px] rounded-md border px-1.5 text-[12.5px] ${l.productId ? "border-line/20" : "border-[var(--status-warning)] bg-[var(--status-warning)]/10"}`}
                                  aria-label={`Product for ${l.item}`}
                                >
                                  <option value="">“{l.item}” — name only</option>
                                  {productList.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                                <span className="text-muted-foreground">@ {formatPeso(l.unitPrice)}</span>
                              </>
                            ) : (
                              <span>{l.item}</span>
                            )}
                          </div>
                        ))}
                        {it.note && <div className="text-[12px] italic text-muted-foreground">{it.note}</div>}
                        {it.duplicate && <div className="text-[12px] font-semibold text-[var(--status-warning)]">Looks already recorded — skipped. Tick to import anyway.</div>}
                        {it.warnings.map((w) => (
                          <div key={w} className="text-[12px] font-semibold text-danger">
                            {w}
                          </div>
                        ))}
                      </td>
                      <td className="px-2.5 py-2">{it.method === "check" ? "Cheque" : it.method === "ewallet" ? "GCash" : it.method === "bank_transfer" ? "Bank" : it.method === "cash" ? "Cash" : "—"}</td>
                      <td className="px-2.5 py-2 text-right font-semibold tabular-nums">{formatPeso(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {progress ? (
              <p className={`text-[14px] font-semibold ${progress.failed ? "text-danger" : "text-success"}`}>
                {finished ? `Done — ${progress.done - progress.failed} imported${progress.failed ? `, ${progress.failed} didn't save (check the internet and import the file again; what's in is skipped)` : ""}.` : `Importing… ${progress.done} of ${progress.total}`}
              </p>
            ) : null}
            <div className="flex gap-2">
              {!progress && (
                <button type="button" disabled={chosen.length === 0} onClick={() => void run()} className="min-h-11 flex-1 rounded-[10px] bg-cacao text-[14px] font-semibold text-ivory disabled:opacity-40">
                  Import {chosen.length} {chosen.length === 1 ? "entry" : "entries"}
                </button>
              )}
              <button type="button" disabled={!!progress && !finished} onClick={onClose} className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold disabled:opacity-40">
                {finished ? "Close" : "Cancel"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
