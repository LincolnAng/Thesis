"use client";

import { useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store/use-store";
import { addProductionRun, replaceProductionRun } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { fullName } from "@/lib/summary/product-sizes";
import { findProduct } from "@/lib/summary/product-match";
import { shelfLifeDays } from "@/lib/summary/business-config";
import { MATERIAL_USE } from "@/lib/transactions/waste";
import { batchesOf, bucketBalance, cacaoPerUnit, runMaterials } from "@/lib/production/runs";
import { PackagingEditor, ProductPicker, fieldCls, labelCls, packagingUsed, recipePackaging, type PackagingLine } from "@/components/production/add-batch-dialog";
import type { Entry, ProductionRun } from "@/lib/store/types";

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const num = (s: string) => Number(s) || 0;
const round = (n: number) => Math.round(n * 1000) / 1000;
const decimal = (v: string) => v.replace(/[^0-9.]/g, "");
const text = (n: number) => (n ? String(n) : "");

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
 * Log production: one batch, start to finish — its name, the raw material put in (cacao into
 * the roaster), what was usable from it, and the finished products made from that. The raw
 * material comes off its shelf; the products go on theirs (taking their other ingredients and
 * packaging, but not the raw material again); whatever usable is left goes into the bucket.
 *
 * Given a run, it changes that run: the old one is taken back whole and this saved in its place.
 */
export function RunDialog({ existing, onClose }: { existing?: ProductionRun; onClose: () => void }) {
  const { products, rawMaterials, entries, businessSettings, cacaoBucket } = useStore();
  const materials = runMaterials(rawMaterials);
  const today = new Date();
  const oldBatches = existing ? batchesOf(entries, new Set([existing.id])) : [];
  const madeToday = entries.filter((e) => e.type === "INVENTORY_IN" && e.timestamp.slice(0, 10) === isoDay(today)).length;

  const [name, setName] = useState(existing?.name ?? "");
  const [date, setDate] = useState(existing?.date ?? isoDay(today));
  const [lotId, setLotId] = useState(existing?.lotId ?? `LOT-${isoDay(today).replace(/-/g, "")}-${madeToday + 1}`);
  const [materialId, setMaterialId] = useState(existing?.materialId || materials[0]?.id || "");
  const material = materials.find((m) => m.id === materialId);
  const unit = material?.unit || "kg";
  const [raw, setRaw] = useState(text(existing?.rawQty ?? 0));
  const [usable, setUsable] = useState(text(existing?.usableQty ?? 0));
  const [fromBucket, setFromBucket] = useState(text(existing?.fromBucketQty ?? 0));
  const [lines, setLines] = useState<Line[]>(() => {
    const from = oldBatches
      .map((b, i): Line | null => {
        const p = findProduct(products, b.sku);
        const packaging = (b.packagingUsed ?? []).filter((x) => rawMaterials.find((m) => m.id === x.materialId)?.kind === "packaging");
        return p ? { key: i, productId: p.id, qty: String(b.quantity ?? ""), packaging: packaging.map((x) => ({ materialId: x.materialId, qty: String(x.qty) })) } : null;
      })
      .filter((l): l is Line => l !== null);
    return from.length > 0 ? from : [{ key: 0, productId: products[0]?.id ?? "", qty: "", packaging: null }];
  });
  const [into, setInto] = useState<string | null>(existing ? text(existing.intoProductsQty) : null);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  // When changing a run, what it took from and put into the bucket goes back first.
  const otherMoves = existing ? cacaoBucket.filter((m) => m.runId !== existing.id) : cacaoBucket;
  const inBucket = material ? bucketBalance(otherMoves, material.id) : 0;
  const productOf = (id: string) => products.find((p) => p.id === id);
  const shownPackaging = (l: Line) => l.packaging ?? recipePackaging(productOf(l.productId), num(l.qty), rawMaterials);
  const byRecipe = round(
    lines.reduce((t, l) => {
      const p = productOf(l.productId);
      return p && material ? t + cacaoPerUnit(p, material.id) * num(l.qty) : t;
    }, 0),
  );
  const available = round(num(usable) + num(fromBucket));
  const intoQty = into === null ? Math.min(byRecipe, available) : num(into);
  const leftover = round(available - intoQty);
  const yieldPct = num(raw) > 0 && num(usable) > 0 ? Math.round((num(usable) / num(raw)) * 100) : null;
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function save() {
    const made = lines.filter((l) => num(l.qty) > 0 && productOf(l.productId));
    if (!name.trim()) return setError("Give the batch a name.");
    if (!(num(raw) > 0) && !(num(fromBucket) > 0) && made.length === 0) return setError("Fill in the raw materials, or what was made.");
    if (num(raw) > 0 && !(num(usable) > 0)) return setError("How much was usable from the raw materials?");
    if (num(usable) > 0 && !(num(raw) > 0)) return setError("How much raw material went in?");
    if (num(usable) > num(raw)) return setError("More usable than raw went in — check the two amounts.");
    if (num(fromBucket) > inBucket) return setError(`Only ${inBucket} ${unit} in the bucket.`);
    if (intoQty > available + 1e-9) return setError(`Only ${available} ${unit} usable to work with — what was usable plus what came from the bucket.`);
    if (made.length > 0 && byRecipe > 0 && available <= 0) {
      return setError("How much went in? Fill in the raw materials or take some from the bucket — or log it with Add batch instead.");
    }
    if (!lotId.trim()) return setError("Give it a lot number.");
    if ((num(raw) > 0 || num(fromBucket) > 0) && !material) return setError("Add your raw materials under Inventory first.");

    // The time of day now, on the day picked — so a run logged late still sorts by when it was made.
    const stamp = new Date(`${date}T${today.toTimeString().slice(0, 8)}`).toISOString();
    const lot = lotId.trim();
    const batchName = name.trim();
    const usesMaterial = !!material && (num(raw) > 0 || num(fromBucket) > 0);
    const out: Omit<Entry, "id" | "runId">[] = [];
    if (num(raw) > 0 && material) {
      out.push({
        ...blankEntryDraft("INVENTORY_OUT", `${batchName}: ${num(raw)} ${unit} of ${material.name} in → ${num(usable)} ${unit} usable · lot ${lot}`),
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
        ...blankEntryDraft("INVENTORY_IN", `${batchName}: made ${num(l.qty)} ${u} of ${fullName(p, products)} · lot ${lot}`),
        timestamp: stamp,
        sku: p.name,
        quantity: num(l.qty),
        unit: u,
        lotId: lot,
        expiresOn: isoDay(expires),
        // The raw material is named with 0: this run's own stock-out already took it.
        packagingUsed: [...packagingUsed(shownPackaging(l)), ...(usesMaterial ? [{ materialId: material!.id, qty: 0 }] : [])],
      });
    }
    const moves = [];
    if (num(fromBucket) > 0 && material) {
      moves.push({ materialId: material.id, direction: "out" as const, qty: num(fromBucket), unit, date, purpose: `Used in ${batchName} · lot ${lot}` });
    }
    if (leftover > 0 && material) {
      moves.push({ materialId: material.id, direction: "in" as const, qty: leftover, unit, date, purpose: `Left over from ${batchName} · lot ${lot}` });
    }
    const run = {
      name: batchName,
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
    };
    if (existing) replaceProductionRun(existing.id, run, out, moves);
    else addProductionRun(run, out, moves);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Change production" : "Log production"}</DialogTitle>
          <DialogDescription>Raw materials in, what was usable, what it became — anything usable left goes in the bucket.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className={labelCls}>
            Batch name
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tablea for Ayala bazaar" className={fieldCls} />
          </label>
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

          <Section title="1 · Raw materials in">
            {materials.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No raw materials set up yet — add them under Inventory. You can still log what was made below.</p>
            ) : (
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <label className={labelCls}>
                  Raw material
                  <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={fieldCls}>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  How much ({unit})
                  <input inputMode="decimal" value={raw} onChange={(e) => setRaw(decimal(e.target.value))} placeholder="e.g. 10" className={fieldCls} />
                </label>
              </div>
            )}
          </Section>

          {materials.length > 0 && (
            <Section title="2 · Usable from it">
              <div className="grid grid-cols-[auto_1fr] items-end gap-2">
                <ArrowRight className="mb-3 h-4 w-4 text-muted-foreground" />
                <label className={labelCls}>
                  Usable ({unit})
                  <input inputMode="decimal" value={usable} onChange={(e) => setUsable(decimal(e.target.value))} placeholder="e.g. 7" className={fieldCls} />
                </label>
              </div>
              {yieldPct !== null && (
                <p className="text-[13px]">
                  <span className="font-semibold">{yieldPct}% usable</span>
                  <span className="text-muted-foreground"> · {round(num(raw) - num(usable))} {unit} lost (roasting, shelling)</span>
                </p>
              )}
              {inBucket > 0 && (
                <label className={labelCls}>
                  Also from the leftover bucket ({unit}) — {inBucket} in it
                  <input inputMode="decimal" value={fromBucket} onChange={(e) => setFromBucket(decimal(e.target.value))} placeholder="0" className={fieldCls} />
                </label>
              )}
            </Section>
          )}

          <Section title={materials.length > 0 ? "3 · Finished products made from it" : "Finished products"}>
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
            <Section title="Left over">
              <div className="grid grid-cols-2 gap-3">
                <label className={labelCls}>
                  Usable that went in ({unit})
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
                {available > 0 ? `${available} ${unit} usable to work with` : "Nothing usable yet"}
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
