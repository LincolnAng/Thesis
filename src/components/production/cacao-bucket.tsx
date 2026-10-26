"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BUTTON } from "@/components/ui/kit";
import { useStore } from "@/lib/store/use-store";
import { addCacaoMove, deleteCacaoMove } from "@/lib/store/store";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { bucketBalance, newestFirst, runMaterials } from "@/lib/production/runs";
import { fieldCls, labelCls } from "@/components/production/add-batch-dialog";

const SHOWN = 8;
const OUT_REASONS = ["Samples", "Tasting", "Spoiled", "Given away"];
const IN_REASONS = ["Not logged before", "Found while cleaning up"];

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return y ? new Date(y, m - 1, d).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : iso;
};

/**
 * The leftover bucket: usable material (cacao, mostly) a run didn't use. How much is in it, and every time
 * some went in or came out — when, how much, what for and who logged it.
 */
export function CacaoBucket() {
  const { cacaoBucket, rawMaterials } = useStore();
  const exec = isExecutive(useCurrentUser());
  const [dialog, setDialog] = useState<"in" | "out" | null>(null);
  const [all, setAll] = useState(false);
  const cacao = runMaterials(rawMaterials);
  // A material still in the history but no longer listed keeps its bucket.
  const ids = [...new Set([...cacao.map((m) => m.id), ...cacaoBucket.map((m) => m.materialId)])];
  const nameOf = (id: string) => rawMaterials.find((m) => m.id === id)?.name ?? "Cacao no longer listed";
  const unitOf = (id: string) => rawMaterials.find((m) => m.id === id)?.unit ?? cacaoBucket.find((m) => m.materialId === id)?.unit ?? "kg";
  // Every material that has ever been in it, or the first one a run starts from (cacao) when it's empty.
  const balances = ids.map((id) => ({ id, qty: bucketBalance(cacaoBucket, id) })).filter((b) => b.qty !== 0 || b.id === cacao[0]?.id);
  const history = newestFirst(cacaoBucket);
  const shown = all ? history : history.slice(0, SHOWN);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line/15 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[20px] font-semibold">Leftover bucket</h2>
        {cacao.length > 0 && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setDialog("in")} className={BUTTON.secondary}>
              <ArrowDownToLine className="h-4 w-4" /> Put in
            </button>
            <button type="button" onClick={() => setDialog("out")} disabled={!balances.some((b) => b.qty > 0)} className={BUTTON.secondary}>
              <ArrowUpFromLine className="h-4 w-4" /> Take out
            </button>
          </div>
        )}
      </div>

      {balances.length === 0 ? (
        <p className="text-[13.5px] text-muted-foreground">No raw materials set up yet — add them under Inventory.</p>
      ) : (
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          {balances.map((b) => (
            <div key={b.id}>
              <div className="font-display text-[30px] font-semibold leading-none tabular-nums text-cacao">
                {b.qty} <span className="text-[16px] text-muted-foreground">{unitOf(b.id)}</span>
              </div>
              <div className="mt-1 text-[12.5px] text-muted-foreground">in the bucket{balances.length > 1 ? ` · ${nameOf(b.id)}` : ""}</div>
            </div>
          ))}
        </div>
      )}

      {history.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nothing in or out yet. What a run doesn&apos;t use lands here when you log production.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-[13px]">
            <thead>
              <tr className="border-b border-line/10 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-3 font-semibold">Date</th>
                <th className="py-1.5 pr-3 font-semibold">In / out</th>
                <th className="py-1.5 pr-3 font-semibold">What for</th>
                <th className="py-1.5 pr-3 font-semibold">By</th>
                {exec && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} className="border-b border-line/5 last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">{dayLabel(m.date)}</td>
                  <td className={`whitespace-nowrap py-2 pr-3 font-semibold tabular-nums ${m.direction === "in" ? "text-success" : "text-danger"}`}>
                    {m.direction === "in" ? <ArrowDownToLine className="mr-1 inline h-3.5 w-3.5" /> : <ArrowUpFromLine className="mr-1 inline h-3.5 w-3.5" />}
                    {m.direction === "in" ? "+" : "−"}
                    {m.qty} {m.unit}
                  </td>
                  <td className="py-2 pr-3">
                    {m.purpose || "—"}
                    {balances.length > 1 ? <span className="text-muted-foreground"> · {nameOf(m.materialId)}</span> : null}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">{m.loggedByName || "—"}</td>
                  {exec && (
                    <td className="py-2 text-right">
                      {/* A run's own moves go when the run is taken back, so the run stays whole. */}
                      {!m.runId && (
                        <button
                          type="button"
                          aria-label="Take back"
                          title="Take back"
                          onClick={() => window.confirm("Take this back? The bucket goes back to what it was before it.") && deleteCacaoMove(m.id)}
                          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {history.length > SHOWN && (
            <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 text-[13px] font-semibold text-cacao">
              {all ? "Show fewer" : `Show all ${history.length}`}
            </button>
          )}
        </div>
      )}

      {dialog && <MoveDialog direction={dialog} onClose={() => setDialog(null)} />}
    </section>
  );
}

/** Putting cacao in by hand, or taking some out — always with what it was for. */
function MoveDialog({ direction, onClose }: { direction: "in" | "out"; onClose: () => void }) {
  const { cacaoBucket, rawMaterials } = useStore();
  const cacao = runMaterials(rawMaterials);
  const choices = direction === "out" ? cacao.filter((m) => bucketBalance(cacaoBucket, m.id) > 0) : cacao;
  const [materialId, setMaterialId] = useState(choices[0]?.id ?? "");
  const material = choices.find((m) => m.id === materialId);
  const balance = material ? bucketBalance(cacaoBucket, material.id) : 0;
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(isoDay(new Date()));
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reasons = direction === "out" ? OUT_REASONS : IN_REASONS;

  function save() {
    const n = Number(qty);
    if (!material) return;
    if (!(n > 0)) return setError("How much?");
    if (direction === "out" && n > balance) return setError(`Only ${balance} ${material.unit} in the bucket.`);
    if (!purpose.trim()) return setError(direction === "out" ? "What was it used for?" : "Where did it come from?");
    addCacaoMove({ materialId: material.id, direction, qty: n, unit: material.unit, date, runId: null, purpose: purpose.trim() });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{direction === "out" ? "Take out of the bucket" : "Put into the bucket"}</DialogTitle>
          <DialogDescription>
            {direction === "out"
              ? "Making more product with it? Use Log production instead — take it from the bucket there."
              : "Leftover cacao that wasn't logged with a run."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {choices.length > 1 && (
            <label className={labelCls}>
              What
              <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={fieldCls}>
                {choices.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              How much ({material?.unit ?? "kg"})
              <input autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={direction === "out" ? `${balance} in it` : "e.g. 0.5"} className={fieldCls} />
            </label>
            <label className={labelCls}>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
            </label>
          </div>
          <div className={labelCls}>
            {direction === "out" ? "What for" : "From where"}
            <div className="flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={purpose === r}
                  onClick={() => setPurpose(r)}
                  className={`min-h-9 rounded-full border px-3 text-[13px] font-medium ${purpose === r ? "border-cacao bg-cacao font-semibold text-ivory" : "border-line/20 bg-card"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Or type it" className={fieldCls} />
          </div>
          {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} className="min-h-11 flex-1 rounded-[10px] bg-cacao text-[14px] font-semibold text-ivory">
              Save
            </button>
            <button type="button" onClick={onClose} className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold">
              Cancel
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
