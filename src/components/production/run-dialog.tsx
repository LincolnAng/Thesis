"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store/use-store";
import { addProductionRun, replaceProductionRun } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { fullName } from "@/lib/summary/product-sizes";
import { findProduct } from "@/lib/summary/product-match";
import { resolveProduct } from "@/lib/ai/product-resolve";
import { shelfLifeDays } from "@/lib/summary/business-config";
import { groupOf } from "@/lib/summary/material-stock";
import { MATERIAL_USE } from "@/lib/transactions/waste";
import { batchesOf, cacaoPerUnit } from "@/lib/production/runs";
import { PackagingEditor, fieldCls, labelCls, packagingUsed, recipePackaging, type PackagingLine } from "@/components/production/add-batch-dialog";
import type { Entry, Product, ProductionRun, RunInput } from "@/lib/store/types";

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const num = (s: string) => Number(s) || 0;
const round = (n: number) => Math.round(n * 1000) / 1000;
const decimal = (v: string) => v.replace(/[^0-9.]/g, "");
const text = (n: number | undefined) => (n ? String(n) : "");
const UNITS = ["kg", "g", "L", "mL", "pcs", "packs", "boxes", "sacks"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-xl border border-line/15 p-3">
      <h3 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

interface InputRow {
  key: string;
  materialId: string;
  qty: string;
  unit: string;
}

interface MadeRow {
  key: string;
  /** Typed; matched to a product by name. */
  name: string;
  qty: string;
  /** Null until changed by hand: then it follows the recipe for how many were made. */
  packaging: PackagingLine[] | null;
}

let seq = 0;
const key = () => `row-${++seq}`;

/**
 * Log production: one batch, start to finish, under its lot ID —
 *
 *   1  Raw materials in   every raw material (or packaging, like boxes) put in: which, how much, the unit
 *   2  Usable, waste, excess   what came out usable, what was lost, and what was made but not packed
 *   3  Tablea pellets      made from the usable
 *   4  Finished products   typed by name, how many, and the packaging each went into
 *
 * The raw materials come off their shelf; the products go on theirs (taking their packaging, but
 * not the raw materials again). Waste and excess are recorded on the batch as waste — there's no
 * leftover bucket (tingi) any more. Given a run, it changes that run: the old one is taken back
 * whole and this saved in its place.
 */
export function RunDialog({ existing, onClose }: { existing?: ProductionRun; onClose: () => void }) {
  const { products, rawMaterials, entries, businessSettings } = useStore();
  const today = new Date();
  const madeToday = entries.filter((e) => e.type === "INVENTORY_IN" && e.timestamp.slice(0, 10) === isoDay(today)).length;
  // Ingredients first, then packaging (boxes, jars) — anything can go in.
  const materials = [...rawMaterials.filter((m) => groupOf(m) === "ingredient"), ...rawMaterials.filter((m) => groupOf(m) === "supply")];
  const productNames = products.map((p) => fullName(p, products));

  const [date, setDate] = useState(existing?.date ?? isoDay(today));
  const [lotId, setLotId] = useState(existing?.lotId || existing?.name || "");
  const suggestedLot = `LOT-${date.replace(/-/g, "")}-${madeToday + 1}`;
  const [inputs, setInputs] = useState<InputRow[]>(() => {
    const saved: RunInput[] = existing?.inputs?.length ? existing.inputs : existing && existing.rawQty > 0 ? [{ materialId: existing.materialId, qty: existing.rawQty, unit: existing.unit }] : [];
    const rows = saved.map((i) => ({ key: key(), materialId: i.materialId, qty: text(i.qty), unit: i.unit || "kg" }));
    return rows.length ? rows : [{ key: key(), materialId: materials[0]?.id ?? "", qty: "", unit: materials[0]?.unit || "kg" }];
  });
  const firstUnit = inputs.find((i) => num(i.qty) > 0)?.unit ?? inputs[0]?.unit ?? "kg";
  const [usable, setUsable] = useState(text(existing?.usableQty));
  const [waste, setWaste] = useState(text(existing?.wasteQty));
  const [excess, setExcess] = useState(text(existing?.excessQty ?? existing?.leftoverQty));
  const [pellets, setPellets] = useState<string | null>(existing ? text(existing.pelletsQty) : null);
  const [made, setMade] = useState<MadeRow[]>(() => {
    const rows: MadeRow[] = [];
    for (const b of existing ? batchesOf(entries, new Set([existing.id])) : []) {
      const p = findProduct(products, b.sku);
      const packaging = (b.packagingUsed ?? []).filter((x) => rawMaterials.find((m) => m.id === x.materialId)?.kind === "packaging");
      rows.push({ key: key(), name: p ? fullName(p, products) : (b.sku ?? ""), qty: text(b.quantity ?? 0), packaging: packaging.map((x) => ({ materialId: x.materialId, qty: String(x.qty) })) });
    }
    return rows.length ? rows : [{ key: key(), name: "", qty: "", packaging: null }];
  });
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  /** The product a typed name means: its full name, or a close match when there's only one. */
  const productFor = (name: string): Product | undefined => {
    const n = name.trim().toLowerCase();
    if (!n) return undefined;
    const exact = products.find((p) => fullName(p, products).toLowerCase() === n);
    if (exact) return exact;
    const r = resolveProduct(products, name);
    return r.kind === "one" ? r.product : undefined;
  };
  const madeLines = made.filter((m) => m.name.trim() && num(m.qty) > 0).map((m) => ({ row: m, product: productFor(m.name), qty: num(m.qty) }));
  const packagingOf = (l: (typeof madeLines)[number]) => l.row.packaging ?? recipePackaging(l.product, l.qty, rawMaterials);

  const rawTotal = round(inputs.filter((i) => i.unit === firstUnit).reduce((t, i) => t + num(i.qty), 0));
  const pelletsQty = pellets === null ? num(usable) : num(pellets);
  const cacaoInput = inputs.find((i) => num(i.qty) > 0);
  const byRecipe = round(madeLines.reduce((t, l) => (l.product && cacaoInput ? t + cacaoPerUnit(l.product, cacaoInput.materialId) * l.qty : t), 0));
  const accounted = round(num(usable) + num(waste) + num(excess));
  const yieldPct = rawTotal > 0 && num(usable) > 0 ? Math.round((num(usable) / rawTotal) * 100) : null;

  function save() {
    const lot = (lotId.trim() || suggestedLot).trim();
    const filled = inputs.filter((i) => i.materialId && num(i.qty) > 0);
    if (filled.length === 0 && madeLines.length === 0) return setError("Fill in the raw materials that went in, or what was made.");
    if (inputs.some((i) => num(i.qty) > 0 && !i.materialId)) return setError("Pick which raw material each amount is.");
    const unknown = madeLines.find((l) => !l.product);
    if (unknown) return setError(`No product called “${unknown.row.name.trim()}” — check the name, or add it in Costing first.`);
    if (pelletsQty > num(usable) + 1e-9 && num(usable) > 0) return setError("More tablea pellets than usable — check the two amounts.");

    // The time of day now, on the day picked — so a run logged late still sorts by when it was made.
    const stamp = new Date(`${date}T${today.toTimeString().slice(0, 8)}`).toISOString();
    const out: Omit<Entry, "id" | "runId">[] = [];
    for (const i of filled) {
      const m = rawMaterials.find((x) => x.id === i.materialId)!;
      out.push({
        ...blankEntryDraft("INVENTORY_OUT", `Lot ${lot}: ${num(i.qty)} ${i.unit} of ${m.name} in`),
        timestamp: stamp,
        sku: m.name,
        quantity: num(i.qty),
        unit: i.unit,
        category: MATERIAL_USE,
        lotId: lot,
      });
    }
    for (const l of madeLines) {
      const p = l.product!;
      const u = p.unit || "jars";
      const expires = new Date(`${date}T00:00:00`);
      expires.setDate(expires.getDate() + shelfLifeDays(businessSettings, p.id));
      out.push({
        ...blankEntryDraft("INVENTORY_IN", `Lot ${lot}: made ${l.qty} ${u} of ${fullName(p, products)}`),
        timestamp: stamp,
        sku: p.name,
        quantity: l.qty,
        unit: u,
        lotId: lot,
        expiresOn: isoDay(expires),
        // The raw materials are named with 0: this run's own stock-outs already took them.
        packagingUsed: [...packagingUsed(packagingOf(l)), ...filled.map((i) => ({ materialId: i.materialId, qty: 0 }))],
      });
    }
    const first = filled[0];
    const run = {
      // The lot ID is the batch's name.
      name: lot,
      date,
      lotId: lot,
      materialId: first?.materialId ?? "",
      unit: first?.unit ?? firstUnit,
      rawQty: rawTotal,
      usableQty: num(usable),
      pelletsQty: round(pelletsQty),
      fromBucketQty: 0,
      intoProductsQty: byRecipe,
      leftoverQty: 0,
      made: madeLines.map((l) => `${fullName(l.product!, products)} × ${l.qty}`).join("; "),
      notes: notes.trim(),
      inputs: filled.map((i) => ({ materialId: i.materialId, qty: num(i.qty), unit: i.unit })),
      wasteQty: num(waste),
      excessQty: num(excess),
    };
    if (existing) replaceProductionRun(existing.id, run, out, []);
    else addProductionRun(run, out, []);
    onClose();
  }

  const patchInput = (k: string, patch: Partial<InputRow>) => setInputs((rows) => rows.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const patchMade = (k: string, patch: Partial<MadeRow>) => setMade((rows) => rows.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const small = "h-11 rounded-lg border border-input bg-transparent px-2 text-[15px] outline-none focus:border-cacao";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{existing ? "Change production" : "Log production"}</DialogTitle>
          <DialogDescription>Raw materials in → usable, waste and excess → tablea pellets → finished products.</DialogDescription>
        </DialogHeader>
        <datalist id="run-products">
          {productNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              Lot ID
              <input autoFocus value={lotId} onChange={(e) => setLotId(e.target.value)} placeholder={suggestedLot} className={fieldCls} />
            </label>
            <label className={labelCls}>
              Date
              <input type="date" value={date} max={isoDay(today)} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
            </label>
          </div>

          <Section title="1 · Raw materials in">
            {materials.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No raw materials yet — add them in Costing → Raw materials. You can still log what was made below.</p>
            ) : (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_90px_92px_40px] gap-2 text-[12px] font-semibold text-muted-foreground">
                  <span>Raw material</span>
                  <span>Quantity</span>
                  <span>Unit</span>
                  <span />
                </div>
                {inputs.map((i) => (
                  <div key={i.key} className="grid grid-cols-[minmax(0,1fr)_90px_92px_40px] items-center gap-2">
                    <select
                      value={i.materialId}
                      onChange={(e) => patchInput(i.key, { materialId: e.target.value, unit: rawMaterials.find((m) => m.id === e.target.value)?.unit || i.unit })}
                      aria-label="Raw material"
                      className={small}
                    >
                      <option value="">Pick one</option>
                      <optgroup label="Raw materials">
                        {materials.filter((m) => groupOf(m) === "ingredient").map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Packaging (boxes, jars…)">
                        {materials.filter((m) => groupOf(m) === "supply").map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <input inputMode="decimal" value={i.qty} onChange={(e) => patchInput(i.key, { qty: decimal(e.target.value) })} placeholder="0" aria-label="Quantity" className={`${small} text-right`} />
                    <select value={i.unit} onChange={(e) => patchInput(i.key, { unit: e.target.value })} aria-label="Unit" className={small}>
                      {[...new Set([i.unit, ...UNITS])].filter(Boolean).map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setInputs((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== i.key) : rows))} aria-label="Remove" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setInputs((rows) => [...rows, { key: key(), materialId: "", qty: "", unit: "kg" }])} className="flex min-h-9 w-fit items-center gap-1 text-[13px] font-semibold text-cacao">
                  <Plus className="h-4 w-4" /> Add another raw material
                </button>
              </>
            )}
          </Section>

          <Section title="2 · Usable, waste and excess">
            <div className="grid grid-cols-3 gap-2">
              <label className={labelCls}>
                Usable ({firstUnit})
                <input inputMode="decimal" value={usable} onChange={(e) => setUsable(decimal(e.target.value))} placeholder="0" className={fieldCls} />
              </label>
              <label className={labelCls}>
                Waste ({firstUnit})
                <input inputMode="decimal" value={waste} onChange={(e) => setWaste(decimal(e.target.value))} placeholder="0" className={fieldCls} />
              </label>
              <label className={labelCls}>
                Excess ({firstUnit})
                <input inputMode="decimal" value={excess} onChange={(e) => setExcess(decimal(e.target.value))} placeholder="0" className={fieldCls} />
              </label>
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              Waste is what was lost (shells, burnt bits). Excess is what was made but not packed — powder, tablea, brandy or ice cream left over — and counts as waste.
              {yieldPct !== null && <span className="font-semibold text-foreground"> {yieldPct}% usable.</span>}
              {rawTotal > 0 && accounted > 0 && Math.abs(accounted - rawTotal) > 1e-6 && (
                <span> {accounted} of the {rawTotal} {firstUnit} put in are accounted for.</span>
              )}
            </p>
          </Section>

          <Section title="3 · Tablea pellets">
            <label className={labelCls}>
              Pellets made ({firstUnit})
              <input inputMode="decimal" value={pellets ?? usable} onChange={(e) => setPellets(decimal(e.target.value))} placeholder="0" className={fieldCls} />
            </label>
          </Section>

          <Section title="4 · Finished products">
            {made.map((m) => {
              const product = productFor(m.name);
              const line = madeLines.find((l) => l.row.key === m.key);
              return (
                <div key={m.key} className="flex flex-col gap-1.5 border-b border-line/10 pb-2.5 last:border-0 last:pb-0">
                  <div className="grid grid-cols-[minmax(0,1fr)_96px_40px] items-center gap-2">
                    <input list="run-products" value={m.name} onChange={(e) => patchMade(m.key, { name: e.target.value, packaging: null })} placeholder="Type the product's name" aria-label="Product" className={small} />
                    <input inputMode="decimal" value={m.qty} onChange={(e) => patchMade(m.key, { qty: decimal(e.target.value), packaging: null })} placeholder="How many" aria-label="How many" className={`${small} text-right`} />
                    <button type="button" onClick={() => setMade((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== m.key) : [{ key: key(), name: "", qty: "", packaging: null }]))} aria-label="Remove" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {m.name.trim() && (
                    <span className={`text-[12px] ${product ? "text-muted-foreground" : "font-semibold text-danger"}`}>
                      {product ? `→ ${fullName(product, products)} · ${product.unit || "jars"}` : "Not a product yet — check the spelling, or add it in Costing."}
                    </span>
                  )}
                  {line && product && (
                    <>
                      <span className="text-[12px] font-semibold text-muted-foreground">Packaging used</span>
                      <PackagingEditor lines={packagingOf(line)} onChange={(pk) => patchMade(m.key, { packaging: pk })} />
                    </>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={() => setMade((rows) => [...rows, { key: key(), name: "", qty: "", packaging: null }])} className="flex min-h-9 w-fit items-center gap-1 text-[13px] font-semibold text-cacao">
              <Plus className="h-4 w-4" /> Add another product
            </button>
          </Section>

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
