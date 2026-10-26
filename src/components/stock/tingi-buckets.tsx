"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BUTTON } from "@/components/ui/kit";
import { SearchSelect } from "@/components/ui/search-select";
import { useStore } from "@/lib/store/use-store";
import { addEntry, addTingiMove } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { fullName } from "@/lib/summary/product-sizes";
import { TINGI, newestFirst, tingiBalance } from "@/lib/production/runs";
import { fieldCls, labelCls, packagingUsed } from "@/components/production/add-batch-dialog";
import { FinishedProducts, linePackaging, madeLines, type Made } from "@/components/production/finished-products";

const SHOWN = 8;

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return y ? new Date(y, m - 1, d).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : iso;
};
const decimal = (v: string) => v.replace(/[^0-9.]/g, "");

/**
 * Tingi: tablea pellets and nothing else — what a production run doesn't pack, kept loose until
 * it's repacked into finished products. One store, in kilos: how much is in it, and every time
 * some went in (left over from a batch, or put in by hand) or came out (repacked, or used in a
 * production run). The same tingi shows on Inventory and on Production.
 */
export function TingiBuckets() {
  const { tingi, productionRuns } = useStore();
  const [dialog, setDialog] = useState<"in" | "repack" | null>(null);
  const [all, setAll] = useState(false);
  const balance = tingiBalance(tingi);
  const history = newestFirst(tingi);
  const shown = all ? history : history.slice(0, SHOWN);
  const batchOf = (lotId: string) => (lotId ? productionRuns.find((r) => r.lotId === lotId)?.name || lotId : "");

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[20px] font-semibold">Tingi</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDialog("in")} className={BUTTON.secondary}>
            <ArrowDownToLine className="h-4 w-4" /> Put in
          </button>
          <button type="button" onClick={() => setDialog("repack")} disabled={balance <= 0} className={BUTTON.secondary}>
            <ArrowUpFromLine className="h-4 w-4" /> Repack
          </button>
        </div>
      </div>

      <div>
        <div className="font-display text-[30px] font-semibold leading-none tabular-nums text-cacao">
          {balance} <span className="text-[16px] text-muted-foreground">{TINGI.unit}</span>
        </div>
        <div className="mt-1 text-[12.5px] text-muted-foreground">of tablea pellets</div>
      </div>

      {history.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nothing in tingi yet. Pellets a batch doesn&apos;t pack land here when you log production.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/10 text-[13px]">
          {shown.map((t) => (
            <li key={t.id} className="flex items-baseline gap-2 py-1.5">
              {t.direction === "in" ? (
                <ArrowDownToLine className="h-3.5 w-3.5 shrink-0 self-center text-success" />
              ) : (
                <ArrowUpFromLine className="h-3.5 w-3.5 shrink-0 self-center text-danger" />
              )}
              <span className="w-14 shrink-0 text-muted-foreground">{dayLabel(t.date)}</span>
              <span className={`w-20 shrink-0 font-semibold tabular-nums ${t.direction === "in" ? "text-success" : "text-danger"}`}>
                {t.direction === "in" ? "+" : "−"}
                {t.qty} {t.unit}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {t.note || (t.direction === "in" ? "Put in" : "Taken out")}
                {t.direction === "out" && !t.runId && t.lotId ? ` · batch ${batchOf(t.lotId)}` : ""}
                {t.loggedByName ? ` · ${t.loggedByName}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {history.length > SHOWN && (
        <button type="button" onClick={() => setAll((a) => !a)} className="self-start text-[13px] font-semibold text-cacao">
          {all ? "Show fewer" : `Show all ${history.length}`}
        </button>
      )}

      {dialog === "in" && <PutInDialog onClose={() => setDialog(null)} />}
      {dialog === "repack" && <RepackDialog balance={balance} onClose={() => setDialog(null)} />}
    </section>
  );
}

/** Pellets put into tingi by hand: how much, when. */
function PutInDialog({ onClose }: { onClose: () => void }) {
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(isoDay(new Date()));
  const [error, setError] = useState<string | null>(null);

  function save() {
    const n = Number(qty);
    if (!(n > 0)) return setError("How much?");
    addTingiMove({ productId: TINGI.id, direction: "in", qty: n, unit: TINGI.unit, date, lotId: "", usedForProductId: null, note: "" });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Put into tingi</DialogTitle>
          <DialogDescription>Loose tablea pellets that weren&apos;t packed.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              How much ({TINGI.unit})
              <input autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(decimal(e.target.value))} placeholder="e.g. 0.5" className={fieldCls} />
            </label>
            <label className={labelCls}>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
            </label>
          </div>
          {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
          <Buttons onSave={save} onClose={onClose} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tingi repacked into finished products — one or several. The products go on the shelf, taking
 * only the packaging they went into: the pellets were made (and their cacao counted) already.
 */
function RepackDialog({ balance, onClose }: { balance: number; onClose: () => void }) {
  const { products, rawMaterials, productionRuns, tingi } = useStore();
  const runs = newestFirst(productionRuns);
  // The batch it came out of: by default the most recent one that left tingi, else the most
  // recent batch of all. Null until picked by hand.
  const fedIds = new Set(tingi.filter((m) => m.direction === "in" && m.runId).map((m) => m.runId));
  const fed = runs.filter((r) => fedIds.has(r.id));
  const [batch, setBatch] = useState<string | null>(null);
  const batchId = batch ?? fed[0]?.id ?? runs[0]?.id ?? "";
  const batchOptions = [
    { value: "", label: "No batch" },
    ...[...fed, ...runs.filter((r) => !fedIds.has(r.id))].map((r) => ({
      value: r.id,
      label: r.name || r.lotId,
      hint: `${r.lotId} · ${dayLabel(r.date)}`,
      group: fedIds.has(r.id) ? "Left tingi" : "Other batches",
    })),
  ];
  const [qty, setQty] = useState("");
  const [made, setMade] = useState<Record<string, Made>>({});
  const [error, setError] = useState<string | null>(null);
  const lines = madeLines(made, products);

  function save() {
    const n = Number(qty);
    if (!(n > 0)) return setError("How much tingi was repacked?");
    if (n > balance) return setError(`Only ${balance} ${TINGI.unit} in tingi.`);
    if (lines.length === 0) return setError("What was it repacked into?");
    const date = isoDay(new Date());
    addTingiMove({
      productId: TINGI.id,
      direction: "out",
      qty: n,
      unit: TINGI.unit,
      date,
      lotId: runs.find((r) => r.id === batchId)?.lotId ?? "",
      usedForProductId: lines.length === 1 ? lines[0].product.id : null,
      note: `Repacked into ${lines.map((l) => `${fullName(l.product, products)} × ${l.qty}`).join(", ")}`,
    });
    for (const l of lines) {
      const unit = l.product.unit || "jars";
      addEntry({
        ...blankEntryDraft("INVENTORY_IN", `Repacked ${l.qty} ${unit} of ${fullName(l.product, products)} from tingi`),
        sku: l.product.name,
        quantity: l.qty,
        unit,
        fromTingi: true,
        packagingUsed: packagingUsed(linePackaging(l, rawMaterials)),
      });
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Repack tingi</DialogTitle>
          <DialogDescription>Tablea pellets repacked into finished products — they go on the shelf, with the packaging they used.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              How much tingi ({TINGI.unit})
              <input autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(decimal(e.target.value))} placeholder={`${balance} in it`} className={fieldCls} />
            </label>
            <div className={labelCls}>
              Batch
              <SearchSelect value={batchId} onChange={setBatch} options={batchOptions} placeholder="No batch" ariaLabel="Batch" />
            </div>
          </div>
          <div className={labelCls}>
            Repacked into
            <FinishedProducts made={made} setMade={setMade} />
          </div>
          {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
          <Buttons onSave={save} onClose={onClose} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Buttons({ onSave, onClose }: { onSave: () => void; onClose: () => void }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={onSave} className="min-h-11 flex-1 rounded-[10px] bg-cacao text-[14px] font-semibold text-ivory">
        Save
      </button>
      <button type="button" onClick={onClose} className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold">
        Cancel
      </button>
    </div>
  );
}
