"use client";

import { useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store/use-store";
import { addProductionRun } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { fullName } from "@/lib/summary/product-sizes";
import { shelfLifeDays } from "@/lib/summary/business-config";
import { MATERIAL_USE } from "@/lib/transactions/waste";
import { bucketBalance, cacaoMaterials, cacaoPerUnit } from "@/lib/production/runs";
import { PackagingEditor, ProductPicker, fieldCls, labelCls, packagingUsed, recipePackaging, type PackagingLine } from "@/components/production/add-batch-dialog";
import type { Entry } from "@/lib/store/types";

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const num = (s: string) => Number(s) || 0;
const round = (n: number) => Math.round(n * 1000) / 1000;
const decimal = (v: string) => v.replace(/[^0-9.]/g, "");

interface Line {
  key: number;
  productId: string;
  qty: string;
  /** Null until changed by hand: then it follows the recipe for how many were made. */
  packaging: PackagingLine[] | null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-xl border border-line/15 p-3">
      <h3 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Log production: one run, start to finish. The raw cacao fed into the roaster comes off its
 * shelf; the finished products go on theirs (taking their other ingredients and packaging, but
 * no raw cacao — the roast already did); and whatever usable cacao is left goes into the bucket.
 */
export function RunDialog({ onClose }: { onClose: () => void }) {
  const { products, rawMaterials, entries, businessSettings, cacaoBucket } = useStore();
  const cacao = cacaoMaterials(rawMaterials);
  const today = new Date();
  const [date, setDate] = useState(isoDay(today));
  const madeToday = entries.filter((e) => e.type === "INVENTORY_IN" && e.timestamp.slice(0, 10) === isoDay(today)).length;
  const [lotId, setLotId] = useState(`LOT-${isoDay(today).replace(/-/g, "")}-${madeToday + 1}`);
  const [materialId, setMaterialId] = useState(cacao[0]?.id ?? "");
  const material = cacao.find((m) => m.id === materialId);
  const unit = material?.unit || "kg";
  const [raw, setRaw] = useState("");
  const [usable, setUsable] = useState("");
  const [fromBucket, setFromBucket] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: 0, productId: products[0]?.id ?? "", qty: "", packaging: null }]);
  const [into, setInto] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inBucket = material ? bucketBalance(cacaoBucket, material.id) : 0;
  const productOf = (id: string) => products.find((p) => p.id === id);
  const shownPackaging = (l: Line) => l.packaging ?? recipePackaging(productOf(l.productId), num(l.qty), rawMaterials);
  const byRecipe = round(lines.reduce((t, l) => {
    const p = productOf(l.productId);
    return p && material ? t + cacaoPerUnit(p, material.id) * num(l.qty) : t;
  }, 0));
  const available = round(num(usable) + num(fromBucket));
  const intoQty = into === null ? Math.min(byRecipe, available) : num(into);
  const leftover = round(available - intoQty);
  const yieldPct = num(raw) > 0 && num(usable) > 0 ? Math.round((num(usable) / num(raw)) * 100) : null;
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function save() {
    const made = lines.filter((l) => num(l.qty) > 0 && productOf(l.productId));
    if (!(num(raw) > 0) && !(num(fromBucket) > 0) && made.length === 0) return setError("Fill in the roast, or what was made.");
    if (num(raw) > 0 && !(num(usable) > 0)) return setError("How much usable cacao came out of the roast?");
    if (num(usable) > 0 && !(num(raw) > 0)) return setError("How much raw cacao went into the roaster?");
    if (num(usable) > num(raw)) return setError("More usable cacao than raw went in — check the two amounts.");
    if (num(fromBucket) > inBucket) return setError(`Only ${inBucket} ${unit} in the bucket.`);
    if (intoQty > available + 1e-9) return setError(`Only ${available} ${unit} of usable cacao to use — the roast plus what came from the bucket.`);
    if (made.length > 0 && byRecipe > 0 && available <= 0) {
      return setError("How much cacao went in? Fill in the roast or take some from the bucket — or log it with Add batch instead.");
    }
    if (!lotId.trim()) return setError("Give it a lot number.");
    if ((num(raw) > 0 || num(fromBucket) > 0) && !material) return setError("Add your raw cacao under Inventory first.");

    // The time of day now, on the day picked — so a run logged late still sorts by when it was made.
    const stamp = new Date(`${date}T${today.toTimeString().slice(0, 8)}`).toISOString();
    const lot = lotId.trim();
    const out: Omit<Entry, "id" | "runId">[] = [];
    if (num(raw) > 0 && material) {
      out.push({
        ...blankEntryDraft("INVENTORY_OUT", `Roasted ${num(raw)} ${unit} of ${material.name} → ${num(usable)} ${unit} usable · lot ${lot}`),
        timestamp: stamp,
        sku: material.name,
        quantity: num(raw),
        unit,
        category: MATERIAL_USE,
        lotId: lot,
      });
    }
    for (const l of made) {
      const p = productOf(l.productId)!;
      const u = p.unit || "jars";
      const expires = new Date(`${date}T00:00:00`);
      expires.setDate(expires.getDate() + shelfLifeDays(businessSettings, p.id));
      out.push({
        ...blankEntryDraft("INVENTORY_IN", `Made ${num(l.qty)} ${u} of ${fullName(p, products)} · lot ${lot}`),
        timestamp: stamp,
        sku: p.name,
        quantity: num(l.qty),
        unit: u,
        lotId: lot,
        expiresOn: isoDay(expires),
        packagingUsed: packagingUsed(shownPackaging(l)),
      });
    }
    const moves = [];
    if (num(fromBucket) > 0 && material) {
      moves.push({ materialId: material.id, direction: "out" as const, qty: num(fromBucket), unit, date, purpose: `Used in production · lot ${lot}` });
    }
    if (leftover > 0 && material) {
      moves.push({ materialId: material.id, direction: "in" as const, qty: leftover, unit, date, purpose: `Left over · lot ${lot}` });
    }
    addProductionRun(
      {
        date,
        lotId: lot,
        materialId: material?.id ?? "",
        unit,
        rawQty: num(raw),
        usableQty: num(usable),
        fromBucketQty: num(fromBucket),
        intoProductsQty: round(intoQty),
        leftoverQty: Math.max(0, leftover),
        made: made.map((l) => `${fullName(productOf(l.productId)!, products)} × ${num(l.qty)}`).join("; "),
        notes: notes.trim(),
      },
      out,
      moves,
    );
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log production</DialogTitle>
          <DialogDescription>Raw cacao in, usable cacao out, what it became — and what&apos;s left goes in the bucket.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              Date
              <input type="date" value={date} max={isoDay(today)} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
            </label>
            <label className={labelCls}>
              Lot ID
              <input value={lotId} onChange={(e) => setLotId(e.target.value)} className={fieldCls} />
            </label>
          </div>

          <Section title="1 · Roasting">
            {cacao.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No raw cacao set up yet — add it under Inventory (e.g. &quot;Cacao beans&quot;). You can still log what was made below.
              </p>
            ) : (
              <>
                {cacao.length > 1 && (
                  <label className={labelCls}>
                    Raw cacao
                    <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={fieldCls}>
                      {cacao.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <label className={labelCls}>
                    Raw cacao in ({unit})
                    <input autoFocus inputMode="decimal" value={raw} onChange={(e) => setRaw(decimal(e.target.value))} placeholder="e.g. 10" className={fieldCls} />
                  </label>
                  <ArrowRight className="mb-3 h-4 w-4 text-muted-foreground" />
                  <label className={labelCls}>
                    Usable out ({unit})
                    <input inputMode="decimal" value={usable} onChange={(e) => setUsable(decimal(e.target.value))} placeholder="e.g. 7" className={fieldCls} />
                  </label>
                </div>
                {yieldPct !== null && (
                  <p className="text-[13px]">
                    <span className="font-semibold">{yieldPct}% usable</span>
                    <span className="text-muted-foreground"> · {round(num(raw) - num(usable))} {unit} lost to roasting and shelling</span>
                  </p>
                )}
                {inBucket > 0 && (
                  <label className={labelCls}>
                    Also from the leftover bucket ({unit}) — {inBucket} in it
                    <input inputMode="decimal" value={fromBucket} onChange={(e) => setFromBucket(decimal(e.target.value))} placeholder="0" className={fieldCls} />
                  </label>
                )}
              </>
            )}
          </Section>

          <Section title="2 · Finished products">
            {products.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Add a product first, in Costing.</p>
            ) : (
              <>
                {lines.map((l) => {
                  const p = productOf(l.productId);
                  return (
                    <div key={l.key} className="flex flex-col gap-2 border-b border-line/10 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <ProductPicker value={l.productId} onChange={(id) => setLine(l.key, { productId: id, packaging: null })} className={`${fieldCls} min-w-0 flex-1`} />
                        <input
                          inputMode="decimal"
                          value={l.qty}
                          onChange={(e) => setLine(l.key, { qty: decimal(e.target.value) })}
                          placeholder="How many"
                          aria-label="How many were made"
                          className={`${fieldCls} w-24`}
                        />
                        <span className="w-10 truncate text-[12.5px] text-muted-foreground">{p?.unit || "jars"}</span>
                        {lines.length > 1 && (
                          <button type="button" aria-label="Remove" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="pl-1">
                        <div className="mb-1 text-[12px] font-semibold text-muted-foreground">Packaging used</div>
                        <PackagingEditor lines={shownPackaging(l)} onChange={(pk) => setLine(l.key, { packaging: pk })} />
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setLines((ls) => [...ls, { key: Math.max(...ls.map((x) => x.key)) + 1, productId: products[0]?.id ?? "", qty: "", packaging: null }])}
                  className="flex items-center gap-1 self-start text-[13px] font-semibold text-cacao"
                >
                  <Plus className="h-4 w-4" /> Another product
                </button>
              </>
            )}
          </Section>

          {material && (
            <Section title="3 · Cacao">
              <div className="grid grid-cols-2 gap-3">
                <label className={labelCls}>
                  Went into the products ({unit})
                  <input
                    inputMode="decimal"
                    value={into ?? (intoQty ? String(round(intoQty)) : "")}
                    onChange={(e) => setInto(decimal(e.target.value))}
                    placeholder="0"
                    className={fieldCls}
                  />
                </label>
                <div className={labelCls}>
                  Left over → bucket
                  <div className={`flex h-11 items-center rounded-lg bg-oat px-3 text-[17px] font-bold tabular-nums ${leftover < 0 ? "text-danger" : ""}`}>
                    {Math.max(0, leftover)} {unit}
                  </div>
                </div>
              </div>
              <p className="text-[12.5px] text-muted-foreground">
                {available > 0 ? `${available} ${unit} usable to work with` : "Nothing roasted or taken from the bucket yet"}
                {byRecipe > 0 ? ` · the recipes call for ${byRecipe} ${unit}` : ""}
              </p>
            </Section>
          )}

          <label className={labelCls}>
            Notes
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={fieldCls} />
          </label>

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
