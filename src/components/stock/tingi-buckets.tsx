"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BUTTON } from "@/components/ui/kit";
import { useStore } from "@/lib/store/use-store";
import { addEntry, addTingiMove } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { fullName } from "@/lib/summary/product-sizes";
import { PackagingEditor, ProductPicker, TINGI_UNITS, fieldCls, labelCls, packagingUsed, recipePackaging, type PackagingLine } from "@/components/production/add-batch-dialog";
import { SearchSelect } from "@/components/ui/search-select";
import { newestFirst } from "@/lib/production/runs";
import type { Product, TingiMove } from "@/lib/store/types";

/** One bucket: a product's loose leftovers in one unit, with every time some went in or came out. */
interface Bucket {
  key: string;
  productId: string;
  unit: string;
  balance: number;
  moves: TingiMove[];
}

const round = (n: number) => Math.round(n * 100) / 100;
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return y ? new Date(y, m - 1, d).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : iso;
};

export function bucketsOf(moves: TingiMove[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const t of moves) {
    const key = `${t.productId}|${t.unit}`;
    const b = map.get(key) ?? { key, productId: t.productId, unit: t.unit, balance: 0, moves: [] };
    b.balance = round(b.balance + (t.direction === "in" ? t.qty : -t.qty));
    b.moves.push(t);
    map.set(key, b);
  }
  return [...map.values()].map((b) => ({ ...b, moves: b.moves.sort((x, y) => (y.date + y.createdAt).localeCompare(x.date + x.createdAt)) }));
}

/**
 * Tingi: the loose product left over from a batch that doesn't fill a pack — the tablea pellets
 * a production run doesn't use, mostly — kept in a bucket per product. Each bucket shows how much
 * is in it, and every time some went in (left over from which batch, or put in by hand) or came
 * out (repacked into a finished product, or used in a production run). The same buckets show on
 * Inventory and on Production.
 */
export function TingiBuckets() {
  const { tingi, products, productionRuns } = useStore();
  const [using, setUsing] = useState<string | null>(null);
  const [putting, setPutting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const buckets = bucketsOf(tingi).filter((b) => b.balance > 0 || b.moves.length > 0);
  const nameOf = (id: string | null) => {
    const p = products.find((x) => x.id === id);
    return p ? fullName(p, products) : "A product no longer listed";
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[20px] font-semibold">Tingi</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPutting(true)} className={BUTTON.secondary}>
            <ArrowDownToLine className="h-4 w-4" /> Put in
          </button>
          {buckets.some((b) => b.balance > 0) && (
            <button type="button" onClick={() => setUsing(buckets.find((b) => b.balance > 0)!.key)} className={BUTTON.secondary}>
              <ArrowUpFromLine className="h-4 w-4" /> Repack
            </button>
          )}
        </div>
      </div>
      {buckets.length === 0 ? (
        <p className="rounded-2xl border border-line/15 bg-card px-4 py-3 text-[13.5px] text-muted-foreground">
          Nothing loose yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/15 bg-card">
          {buckets.map((b) => (
            <li key={b.key} className="px-3 py-2.5">
              <button type="button" onClick={() => setOpen(open === b.key ? null : b.key)} className="flex w-full items-center gap-3 text-left">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{nameOf(b.productId)}</span>
                <span className="text-[18px] font-bold tabular-nums">{b.balance}</span>
                <span className="text-[13px] text-muted-foreground">{b.unit}</span>
              </button>
              {open === b.key && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-line/10 pt-2 text-[13px]">
                  {b.moves.map((t) => (
                    <li key={t.id} className="flex items-baseline gap-2">
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
                        {t.direction === "in"
                          ? t.note || (t.lotId ? `from lot ${t.lotId}` : "put in")
                          : t.usedForProductId
                            ? `repacked as ${nameOf(t.usedForProductId)}`
                            : t.note || "used"}
                        {t.direction === "out" && t.lotId ? ` · batch ${productionRuns.find((r) => r.lotId === t.lotId)?.name || t.lotId}` : ""}
                        {t.loggedByName ? ` · ${t.loggedByName}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {putting && <PutInDialog onClose={() => setPutting(false)} />}
      {using && <UseTingiDialog buckets={buckets.filter((b) => b.balance > 0)} initial={using} onClose={() => setUsing(null)} />}
    </section>
  );
}

/** Putting loose product into a bucket by hand: which product, how much, when. */
function PutInDialog({ onClose }: { onClose: () => void }) {
  const { products } = useStore();
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("kg");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [error, setError] = useState<string | null>(null);
  const product = products.find((p) => p.id === productId);

  function save() {
    const n = Number(qty);
    if (!product) return setError("Which product is it?");
    if (!(n > 0)) return setError("How much?");
    addTingiMove({ productId: product.id, direction: "in", qty: n, unit, date, lotId: "", usedForProductId: null, note: "" });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Put into tingi</DialogTitle>
          <DialogDescription>Loose product that doesn&apos;t fill a pack.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className={labelCls}>
            What product
            <ProductPicker value={productId} onChange={setProductId} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              How much
              <span className="flex gap-1.5">
                <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="e.g. 0.5" className={`${fieldCls} min-w-0`} />
                <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${fieldCls} w-[72px] px-2`} aria-label="Unit">
                  {[...new Set([...TINGI_UNITS, product?.unit || "kg"])].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </span>
            </label>
            <label className={labelCls}>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
            </label>
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

/** Taking some out of a bucket: repacked into a finished product, which goes on the shelf. */
function UseTingiDialog({ buckets, initial, onClose }: { buckets: Bucket[]; initial: string; onClose: () => void }) {
  const { products, rawMaterials, productionRuns } = useStore();
  const [key, setKey] = useState(initial);
  const bucket = buckets.find((b) => b.key === key) ?? buckets[0];
  // The batch it came out of: by default the most recent one that left tingi here, else the most
  // recent batch of all. Null until picked by hand.
  const [batch, setBatch] = useState<string | null>(null);
  const runs = newestFirst(productionRuns);
  const fedIds = new Set((bucket?.moves ?? []).filter((m) => m.direction === "in" && m.runId).map((m) => m.runId));
  const fed = runs.filter((r) => fedIds.has(r.id));
  const batchId = batch ?? fed[0]?.id ?? runs[0]?.id ?? "";
  const batchOptions = [
    { value: "", label: "No batch" },
    ...[...fed, ...runs.filter((r) => !fedIds.has(r.id))].map((r) => ({
      value: r.id,
      label: r.name || r.lotId,
      hint: `${r.lotId} · ${dayLabel(r.date)}`,
      group: fedIds.has(r.id) ? "Left tingi here" : "Other batches",
    })),
  ];
  const [qty, setQty] = useState("");
  const [into, setInto] = useState(bucket?.productId ?? products[0]?.id ?? "");
  const [made, setMade] = useState("");
  const [packaging, setPackaging] = useState<PackagingLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const target: Product | undefined = products.find((p) => p.id === into);
  const shownPackaging = packaging ?? recipePackaging(target, Number(made) || 0, rawMaterials);
  const nameOf = (id: string) => {
    const p = products.find((x) => x.id === id);
    return p ? fullName(p, products) : "Product";
  };

  function save() {
    const n = Number(qty);
    if (!bucket) return;
    const finished = Number(made);
    if (!(n > 0)) return setError("How much tingi was repacked?");
    if (n > bucket.balance) return setError(`Only ${bucket.balance} ${bucket.unit} in this tingi.`);
    if (!target) return setError("What was it repacked as?");
    if (!(finished > 0)) return setError(`How many ${target.unit || "jars"} came out?`);
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    addTingiMove({
      productId: bucket.productId,
      direction: "out",
      qty: n,
      unit: bucket.unit,
      date,
      lotId: runs.find((r) => r.id === batchId)?.lotId ?? "",
      usedForProductId: into,
      note: "Repacked",
    });
    // The finished product goes on the shelf, drawing only the packaging it went into.
    addEntry({
      ...blankEntryDraft("INVENTORY_IN", `Repacked ${finished} ${target.unit || "jars"} of ${fullName(target, products)} from tingi`),
      sku: target.name,
      quantity: finished,
      unit: target.unit || "jars",
      fromTingi: true,
      packagingUsed: packagingUsed(shownPackaging),
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Repack tingi</DialogTitle>
          <DialogDescription>Tingi repacked into a finished product — it goes on the shelf, with the packaging it used.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className={labelCls}>
            From the bucket
            <SearchSelect
              value={bucket?.key ?? ""}
              onChange={(k) => {
                setKey(k);
                setBatch(null);
              }}
              options={buckets.map((b) => ({ value: b.key, label: nameOf(b.productId), hint: `${b.balance} ${b.unit}` }))}
              ariaLabel="Which tingi"
            />
          </div>
          <div className={labelCls}>
            Batch
            <SearchSelect value={batchId} onChange={setBatch} options={batchOptions} placeholder="No batch" ariaLabel="Batch" />
          </div>
          <label className={labelCls}>
            How much tingi ({bucket?.unit})
            <input autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))} className={fieldCls} />
          </label>
          <div className={labelCls}>
            Repacked as
            <ProductPicker value={into} onChange={(id) => { setInto(id); setPackaging(null); }} />
          </div>
          <label className={labelCls}>
            How many finished ({target?.unit || "jars"})
            <input inputMode="decimal" value={made} onChange={(e) => setMade(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="e.g. 4" className={fieldCls} />
          </label>
          <div className={labelCls}>
            Packaging used
            <PackagingEditor lines={shownPackaging} onChange={setPackaging} />
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
