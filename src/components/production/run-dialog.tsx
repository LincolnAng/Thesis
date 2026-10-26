"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { useStore } from "@/lib/store/use-store";
import { addProductionRun, replaceProductionRun } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { familiesOf, fullName, sizeName } from "@/lib/summary/product-sizes";
import { findProduct } from "@/lib/summary/product-match";
import { shelfLifeDays } from "@/lib/summary/business-config";
import { MATERIAL_USE } from "@/lib/transactions/waste";
import { PELLETS, batchesOf, bucketBalance, cacaoMaterials, cacaoPerUnit } from "@/lib/production/runs";
import { PackagingEditor, fieldCls, labelCls, packagingUsed, recipePackaging, type PackagingLine } from "@/components/production/add-batch-dialog";
import type { Entry, Product, ProductionRun } from "@/lib/store/types";

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const num = (s: string) => Number(s) || 0;
const round = (n: number) => Math.round(n * 1000) / 1000;
const decimal = (v: string) => v.replace(/[^0-9.]/g, "");
const text = (n: number) => (n ? String(n) : "");

/** One finished product made in the run. */
interface Made {
  qty: number;
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
 * Every product as Inventory lists it — each family with its sizes — in one dropdown, each with
 * how many were made. Anything above zero is in the run.
 */
function ProductsDropdown({ made, onChange }: { made: Record<string, Made>; onChange: (id: string, qty: number) => void }) {
  const { products } = useStore();
  const [open, setOpen] = useState(false);
  const families = familiesOf(products).sort((a, b) => a.head.name.localeCompare(b.head.name));
  const chosen = products.filter((p) => (made[p.id]?.qty ?? 0) > 0);
  const row = (p: Product, label: string) => (
    <div key={p.id} className="flex items-center gap-2 px-3 py-1.5">
      <span className={`min-w-0 flex-1 truncate text-[14px] ${(made[p.id]?.qty ?? 0) > 0 ? "font-semibold" : ""}`}>{label}</span>
      <QuantityStepper value={made[p.id]?.qty ?? 0} onChange={(v) => onChange(p.id, Math.max(0, v ?? 0))} className="w-[118px]" />
      <span className="w-12 truncate text-[12px] text-muted-foreground">{p.unit || "jars"}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`${fieldCls} flex items-center justify-between gap-2 text-left`}>
        <span className={`truncate ${chosen.length ? "" : "text-muted-foreground"}`}>
          {chosen.length ? chosen.map((p) => `${fullName(p, products)} × ${made[p.id].qty}`).join(", ") : "Choose products and how many"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-line/20 bg-card py-1 shadow-sm">
          {families.length === 0 && <p className="px-3 py-2 text-[13px] text-muted-foreground">No products in Inventory yet.</p>}
          {families.map(({ head, all }) =>
            all.length === 1 ? (
              row(head, fullName(head, products))
            ) : (
              <div key={head.id} className="border-b border-line/10 py-1 last:border-0">
                <div className="px-3 pt-1 text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">{head.name}</div>
                {all.map((p) => row(p, sizeName(p)))}
              </div>
            ),
          )}
          <div className="sticky bottom-0 flex justify-end border-t border-line/10 bg-card px-3 pt-1.5">
            <button type="button" onClick={() => setOpen(false)} className="min-h-9 rounded-[10px] bg-cacao px-4 text-[13px] font-semibold text-ivory">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Log production: one batch, start to finish — its name, the raw material put in (cacao into
 * the roaster), what was usable from it, the tablea pellets made from that, and the finished
 * products made from the pellets. The raw material comes off its shelf; the products go on
 * theirs (taking their other ingredients and packaging, but not the raw material again); and
 * the pellets left over go into the bucket.
 *
 * Given a run, it changes that run: the old one is taken back whole and this saved in its place.
 */
export function RunDialog({ existing, onClose }: { existing?: ProductionRun; onClose: () => void }) {
  const { products, rawMaterials, entries, businessSettings, cacaoBucket } = useStore();
  // What goes in is cacao — the raw cacao material(s) in Inventory.
  const materials = cacaoMaterials(rawMaterials);
  const today = new Date();
  const madeToday = entries.filter((e) => e.type === "INVENTORY_IN" && e.timestamp.slice(0, 10) === isoDay(today)).length;

  const [name, setName] = useState(existing?.name ?? "");
  const [date, setDate] = useState(existing?.date ?? isoDay(today));
  const [lotId, setLotId] = useState(existing?.lotId ?? `LOT-${isoDay(today).replace(/-/g, "")}-${madeToday + 1}`);
  const [materialId, setMaterialId] = useState(existing?.materialId || materials[0]?.id || "");
  const material = materials.find((m) => m.id === materialId);
  const unit = material?.unit || "kg";
  const [raw, setRaw] = useState(text(existing?.rawQty ?? 0));
  const [usable, setUsable] = useState(text(existing?.usableQty ?? 0));
  // Null until typed: then it follows what was usable, which is usually all of it.
  const [pellets, setPellets] = useState<string | null>(existing ? text(existing.pelletsQty) : null);
  const [fromBucket, setFromBucket] = useState(text(existing?.fromBucketQty ?? 0));
  const [made, setMade] = useState<Record<string, Made>>(() => {
    const out: Record<string, Made> = {};
    for (const b of existing ? batchesOf(entries, new Set([existing.id])) : []) {
      const p = findProduct(products, b.sku);
      if (!p) continue;
      const packaging = (b.packagingUsed ?? []).filter((x) => rawMaterials.find((m) => m.id === x.materialId)?.kind === "packaging");
      out[p.id] = { qty: (out[p.id]?.qty ?? 0) + (b.quantity ?? 0), packaging: packaging.map((x) => ({ materialId: x.materialId, qty: String(x.qty) })) };
    }
    return out;
  });
  const [into, setInto] = useState<string | null>(existing ? text(existing.intoProductsQty) : null);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  // When changing a run, what it took from and put into the bucket goes back first.
  const otherMoves = existing ? cacaoBucket.filter((m) => m.runId !== existing.id) : cacaoBucket;
  const inBucket = bucketBalance(otherMoves, PELLETS.id);
  // In Inventory's order, so the list below reads like the dropdown.
  const lines = familiesOf(products)
    .sort((a, b) => a.head.name.localeCompare(b.head.name))
    .flatMap((f) => f.all)
    .filter((p) => (made[p.id]?.qty ?? 0) > 0)
    .map((p) => ({ product: p, ...made[p.id] }));
  const shownPackaging = (l: (typeof lines)[number]) => l.packaging ?? recipePackaging(l.product, l.qty, rawMaterials);
  const byRecipe = round(lines.reduce((t, l) => (material ? t + cacaoPerUnit(l.product, material.id) * l.qty : t), 0));
  const pelletsQty = pellets === null ? num(usable) : num(pellets);
  const available = round(pelletsQty + num(fromBucket));
  const intoQty = into === null ? Math.min(byRecipe, available) : num(into);
  const leftover = round(available - intoQty);
  const yieldPct = num(raw) > 0 && num(usable) > 0 ? Math.round((num(usable) / num(raw)) * 100) : null;

  function setQty(id: string, qty: number) {
    setMade((m) => ({ ...m, [id]: { qty, packaging: m[id]?.packaging ?? null } }));
  }

  function save() {
    if (!name.trim()) return setError("Give the batch a name.");
    if (!(num(raw) > 0) && !(num(fromBucket) > 0) && lines.length === 0) return setError("Fill in the cacao, or what was made.");
    if (num(raw) > 0 && !(num(usable) > 0)) return setError("How much usable cacao came out?");
    if (num(usable) > 0 && !(num(raw) > 0)) return setError("How much cacao went in?");
    if (num(usable) > num(raw)) return setError("More usable than raw went in — check the two amounts.");
    if (pelletsQty > num(usable) + 1e-9) return setError("More tablea pellets than usable cacao — check the two amounts.");
    if (num(fromBucket) > inBucket) return setError(`Only ${inBucket} ${unit} of pellets in the bucket.`);
    if (intoQty > available + 1e-9) return setError(`Only ${available} ${unit} of pellets to work with — what was made plus what came from the bucket.`);
    if (lines.length > 0 && byRecipe > 0 && available <= 0) {
      return setError("How many pellets went in? Fill in the cacao or take some from the bucket — or log it with Add batch instead.");
    }
    if (!lotId.trim()) return setError("Give it a lot number.");
    if (num(raw) > 0 && !material) return setError("Add your cacao under Inventory first.");

    // The time of day now, on the day picked — so a run logged late still sorts by when it was made.
    const stamp = new Date(`${date}T${today.toTimeString().slice(0, 8)}`).toISOString();
    const lot = lotId.trim();
    const batchName = name.trim();
    const usesMaterial = !!material && (num(raw) > 0 || num(fromBucket) > 0);
    const out: Omit<Entry, "id" | "runId">[] = [];
    if (num(raw) > 0 && material) {
      out.push({
        ...blankEntryDraft("INVENTORY_OUT", `${batchName}: ${num(raw)} ${unit} of ${material.name} in → ${num(usable)} ${unit} usable → ${pelletsQty} ${unit} tablea pellets · lot ${lot}`),
        timestamp: stamp,
        sku: material.name,
        quantity: num(raw),
        unit,
        category: MATERIAL_USE,
        lotId: lot,
      });
    }
    for (const l of lines) {
      const p = l.product;
      const u = p.unit || "jars";
      const expires = new Date(`${date}T00:00:00`);
      expires.setDate(expires.getDate() + shelfLifeDays(businessSettings, p.id));
      out.push({
        ...blankEntryDraft("INVENTORY_IN", `${batchName}: made ${l.qty} ${u} of ${fullName(p, products)} · lot ${lot}`),
        timestamp: stamp,
        sku: p.name,
        quantity: l.qty,
        unit: u,
        lotId: lot,
        expiresOn: isoDay(expires),
        // The raw material is named with 0: this run's own stock-out already took it.
        packagingUsed: [...packagingUsed(shownPackaging(l)), ...(usesMaterial ? [{ materialId: material!.id, qty: 0 }] : [])],
      });
    }
    const moves = [];
    if (num(fromBucket) > 0) {
      moves.push({ materialId: PELLETS.id, direction: "out" as const, qty: num(fromBucket), unit, date, purpose: `Used in ${batchName} · lot ${lot}` });
    }
    if (leftover > 0) {
      moves.push({ materialId: PELLETS.id, direction: "in" as const, qty: leftover, unit, date, purpose: `Left over from ${batchName} · lot ${lot}` });
    }
    const run = {
      name: batchName,
      date,
      lotId: lot,
      materialId: material?.id ?? "",
      unit,
      rawQty: num(raw),
      usableQty: num(usable),
      pelletsQty: round(pelletsQty),
      fromBucketQty: num(fromBucket),
      intoProductsQty: round(intoQty),
      leftoverQty: Math.max(0, leftover),
      made: lines.map((l) => `${fullName(l.product, products)} × ${l.qty}`).join("; "),
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
          <DialogDescription>Cacao in → usable cacao → tablea pellets → finished products. Pellets left over go in the bucket.</DialogDescription>
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
              <p className="text-[13px] text-muted-foreground">No cacao set up yet — add it under Inventory (e.g. &quot;Cacao beans&quot;). You can still log what was made below.</p>
            ) : (
              <div className={materials.length > 1 ? "grid grid-cols-[1fr_7rem] gap-2" : ""}>
                {/* Only when there's more than one kind of cacao to say which. */}
                {materials.length > 1 && (
                  <label className={labelCls}>
                    Which cacao
                    <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={fieldCls}>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className={labelCls}>
                  Cacao ({unit})
                  <input inputMode="decimal" value={raw} onChange={(e) => setRaw(decimal(e.target.value))} placeholder="e.g. 10" className={fieldCls} />
                </label>
              </div>
            )}
          </Section>

          {materials.length > 0 && (
            <Section title="2 · Usable Cacao">
              <label className={labelCls}>
                Usable cacao ({unit})
                <input inputMode="decimal" value={usable} onChange={(e) => setUsable(decimal(e.target.value))} placeholder="e.g. 7" className={fieldCls} />
              </label>
              {yieldPct !== null && (
                <p className="text-[13px]">
                  <span className="font-semibold">{yieldPct}% usable</span>
                  <span className="text-muted-foreground"> · {round(num(raw) - num(usable))} {unit} lost (roasting, shelling)</span>
                </p>
              )}
            </Section>
          )}

          <Section title={materials.length > 0 ? "3 · Tablea pellets" : "Tablea pellets"}>
            <label className={labelCls}>
              Pellets made ({unit})
              <input inputMode="decimal" value={pellets ?? usable} onChange={(e) => setPellets(decimal(e.target.value))} placeholder="e.g. 7" className={fieldCls} />
            </label>
            {num(usable) > 0 && pelletsQty < num(usable) && (
              <p className="text-[13px] text-muted-foreground">
                {round(num(usable) - pelletsQty)} {unit} of the usable cacao didn&apos;t become pellets
              </p>
            )}
            {inBucket > 0 && (
              <label className={labelCls}>
                Also from the leftover bucket ({unit}) — {inBucket} in it
                <input inputMode="decimal" value={fromBucket} onChange={(e) => setFromBucket(decimal(e.target.value))} placeholder="0" className={fieldCls} />
              </label>
            )}
          </Section>

          <Section title={materials.length > 0 ? "4 · Finished products made from the pellets" : "Finished products"}>
            <ProductsDropdown made={made} onChange={setQty} />
            {lines.map((l) => (
              <div key={l.product.id} className="flex flex-col gap-1.5 border-t border-line/10 pt-2.5">
                <div className="flex items-baseline justify-between gap-2 text-[14px]">
                  <span className="truncate font-semibold">{fullName(l.product, products)}</span>
                  <span className="shrink-0 tabular-nums">
                    {l.qty} <span className="text-muted-foreground">{l.product.unit || "jars"}</span>
                  </span>
                </div>
                <div className="text-[12px] font-semibold text-muted-foreground">Packaging used</div>
                <PackagingEditor lines={shownPackaging(l)} onChange={(pk) => setMade((m) => ({ ...m, [l.product.id]: { ...m[l.product.id], packaging: pk } }))} />
              </div>
            ))}
          </Section>

          <Section title="Left over">
            <div className="grid grid-cols-2 gap-3">
              <label className={labelCls}>
                Pellets that went in ({unit})
                <input inputMode="decimal" value={into ?? (intoQty ? String(round(intoQty)) : "")} onChange={(e) => setInto(decimal(e.target.value))} placeholder="0" className={fieldCls} />
              </label>
              <div className={labelCls}>
                Left over → bucket
                <div className={`flex h-11 items-center rounded-lg bg-oat px-3 text-[17px] font-bold tabular-nums ${leftover < 0 ? "text-danger" : ""}`}>
                  {Math.max(0, leftover)} {unit}
                </div>
              </div>
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              {available > 0 ? `${available} ${unit} of pellets to work with` : "No pellets yet"}
              {byRecipe > 0 ? ` · the recipes call for ${byRecipe} ${unit}` : ""}
            </p>
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
