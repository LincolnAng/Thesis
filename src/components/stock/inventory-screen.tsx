"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Camera, Package, Plus, Settings2 } from "lucide-react";
import { Page } from "@/components/layout/page";
import { BUTTON, Pill } from "@/components/ui/kit";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store/use-store";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { addEntry, addStockTransfer, setBusinessSetting, updateProduct, updateRawMaterial } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { setProductPhoto, shrinkImage, useProductPhotos } from "@/lib/products/photos";
import { profileColor } from "@/lib/auth/profile-colors";
import { familiesOf, fullName, sizeName } from "@/lib/summary/product-sizes";
import { productExpiry } from "@/lib/summary/product-lots";
import { cacaoUtilizationPct, expiringWithinDays, shelfLifeDays } from "@/lib/summary/business-config";
import { allStandings, groupOf } from "@/lib/summary/material-stock";
import { BRANCHES_KEY, branchesOf, mainBranch, newBranchId, stockByBranch, type Branch } from "@/lib/inventory/branches";
import { pluralize } from "@/lib/format";
import type { Product, RawMaterialStock } from "@/lib/store/types";

/**
 * Inventory, for everyone: what's on hand at each branch (CDO, Manila, and any added — in other
 * countries too) and in all of them together. A product's sizes are one entry, with each size
 * beneath it. Raw materials and packaging are listed after. Tap a picture to add a photo.
 *
 * Stock comes in with Add stock (a batch made, or stock received) and moves between branches
 * with Move stock. Sales, spoilage and waste recorded on Transactions take it off at their
 * branch. Executives also set each item's unit and the list of branches.
 */

const PRODUCT_UNITS = ["jars", "bottles", "packs", "pcs", "boxes", "pints", "tubs", "bars", "kg", "g", "L", "mL"];
const MATERIAL_UNITS = ["kg", "g", "L", "mL", "pcs", "packs", "boxes", "rolls", "sacks"];

type Status = "out" | "low" | "ok";
const STATUS: Record<Status, { label: string; tone: "bad" | "warn" | "good" }> = {
  out: { label: "Out of stock", tone: "bad" },
  low: { label: "Running low", tone: "warn" },
  ok: { label: "In stock", tone: "good" },
};

function PhotoButton({ id, photo, fallbackIndex, size = "h-14 w-14" }: { id: string; photo: string | undefined; fallbackIndex: number; size?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        aria-label={photo ? "Change photo" : "Add a photo"}
        title={photo ? "Change photo" : "Add a photo"}
        className={`group relative ${size} shrink-0 overflow-hidden rounded-lg`}
      >
        {photo ? (
          // A small data URL from the shop's own upload; next/image can't optimise these.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center" style={{ background: profileColor(undefined, fallbackIndex) }}>
            <Package className="h-6 w-6 text-ivory" strokeWidth={1.5} />
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
          <Camera className="h-5 w-5 text-white" />
        </span>
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            if (!(await setProductPhoto(id, await shrinkImage(file)))) alert("The photo shows here but didn't save for everyone — check the internet and try again.");
          } catch {
            alert("That file couldn't be read as a photo — try a JPG or PNG.");
          }
        }}
      />
    </>
  );
}

function UnitPicker({ value, options, onChange }: { value: string; options: string[]; onChange: (u: string) => void }) {
  const list = options.includes(value) || !value ? options : [value, ...options];
  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__other") {
          const typed = window.prompt("Unit of measurement (e.g. tubs, trays, sachets)")?.trim();
          if (typed) onChange(typed);
        } else onChange(e.target.value);
      }}
      aria-label="Unit of measurement"
      className="h-8 rounded-md border border-line/20 bg-card px-1.5 text-[12.5px]"
    >
      {list.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
      <option value="__other">Other…</option>
    </select>
  );
}

export function InventoryScreen() {
  const { products, entries, rawMaterials, businessSettings, stockTransfers } = useStore();
  const exec = isExecutive(useCurrentUser());
  const photos = useProductPhotos();
  const branches = branchesOf(businessSettings);
  const [view, setView] = useState<string>("all");
  const [dialog, setDialog] = useState<"add" | "move" | "branches" | null>(null);
  const within = expiringWithinDays(businessSettings);

  const byBranch = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, stockByBranch(p, products, entries, stockTransfers, branches)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- branches is derived from businessSettings
    [products, entries, stockTransfers, businessSettings],
  );
  const qtyAt = (p: Product) => (view === "all" ? p.stockQty : (byBranch[p.id]?.[view] ?? 0));
  const statusOf = (p: Product): Status => {
    const q = qtyAt(p);
    if (q <= 0) return "out";
    if (p.lowStockThreshold > 0 && q <= p.lowStockThreshold) return "low";
    return "ok";
  };

  const families = familiesOf(products).sort((a, b) => a.head.name.localeCompare(b.head.name));
  const standings = allStandings(entries, products, rawMaterials, cacaoUtilizationPct(businessSettings) / 100);
  const materials = (group: "ingredient" | "supply") => standings.filter((s) => groupOf(s.material) === group).sort((a, b) => a.material.name.localeCompare(b.material.name));
  const needAttention = products.filter((p) => statusOf(p) !== "ok").length;

  return (
    <Page
      title="Inventory"
      right={
        <>
          {exec && (
            <button type="button" onClick={() => setDialog("branches")} className={BUTTON.secondary}>
              <Settings2 className="h-4 w-4" /> Branches
            </button>
          )}
          {branches.length > 1 && (
            <button type="button" onClick={() => setDialog("move")} className={BUTTON.secondary}>
              <ArrowRightLeft className="h-4 w-4" /> Move stock
            </button>
          )}
          <button type="button" onClick={() => setDialog("add")} className={BUTTON.primary}>
            <Plus className="h-4 w-4" /> Add stock
          </button>
        </>
      }
    >
      <div className="flex max-w-[1000px] flex-col gap-5">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which branch">
          {[{ id: "all", name: "All branches", country: "" }, ...branches].map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={view === b.id}
              onClick={() => setView(b.id)}
              className={`min-h-10 rounded-full border px-4 text-[14px] font-semibold transition ${view === b.id ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card hover:border-cacao/50"}`}
            >
              {b.name}
              {b.country && b.country !== "Philippines" ? <span className="ml-1 font-normal opacity-80">· {b.country}</span> : null}
            </button>
          ))}
        </div>

        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[20px] font-semibold">Products</h2>
            <span className="text-[13px] text-muted-foreground">
              {pluralize(products.length, "product")}
              {needAttention > 0 ? <span className="font-semibold text-danger"> · {needAttention} need restocking</span> : " · everything is in stock"}
            </span>
          </div>
          {families.length === 0 ? (
            <p className="rounded-2xl border border-line/15 bg-card px-6 py-10 text-center text-sm text-muted-foreground">No products yet. An Executive adds them in Costing.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {families.map(({ head, all }, i) => {
                const total = all.reduce((n, p) => n + qtyAt(p), 0);
                const worst = all.map(statusOf).sort((a, b) => ["out", "low", "ok"].indexOf(a) - ["out", "low", "ok"].indexOf(b))[0];
                return (
                  <li key={head.id} className="rounded-2xl border border-line/15 bg-card p-3">
                    <div className="flex items-center gap-3">
                      <PhotoButton id={head.id} photo={photos[head.id]} fallbackIndex={i} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold">{head.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                          <Pill tone={STATUS[worst].tone}>{STATUS[worst].label}</Pill>
                          {all.length > 1 && <span className="text-muted-foreground">{all.length} sizes</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-display text-[24px] font-bold tabular-nums leading-none">{total}</div>
                        <div className="text-[12px] text-muted-foreground">on hand{view === "all" ? "" : ` in ${branches.find((b) => b.id === view)?.name}`}</div>
                      </div>
                    </div>
                    <ul className="mt-2 flex flex-col divide-y divide-line/10 rounded-xl bg-secondary/40">
                      {all.map((p) => {
                        const expiry = productExpiry(entries, p, shelfLifeDays(businessSettings, p.id), within, new Date(), products);
                        const s = statusOf(p);
                        return (
                          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13.5px]">
                            <span className="min-w-[90px] font-semibold">{all.length > 1 ? sizeName(p) : "Stock"}</span>
                            <span className={`font-bold tabular-nums ${s === "out" ? "text-danger" : s === "low" ? "text-[var(--status-warning)]" : ""}`}>{qtyAt(p)}</span>
                            {exec ? (
                              <UnitPicker value={p.unit || "jars"} options={PRODUCT_UNITS} onChange={(u) => updateProduct(p.id, { unit: u })} />
                            ) : (
                              <span className="text-muted-foreground">{p.unit || "jars"}</span>
                            )}
                            {view === "all" && branches.length > 1 && (
                              <span className="text-[12.5px] text-muted-foreground">{branches.map((b) => `${b.name} ${byBranch[p.id]?.[b.id] ?? 0}`).join(" · ")}</span>
                            )}
                            <span className="ml-auto flex flex-wrap gap-1.5 text-[12px]">
                              {p.lowStockThreshold > 0 && <span className="text-muted-foreground">restock at {p.lowStockThreshold}</span>}
                              {expiry.expired > 0 && <span className="font-semibold text-danger">{expiry.expired} past their date</span>}
                              {expiry.expiring > 0 && <span className="font-semibold text-[var(--status-warning)]">{expiry.expiring} expiring soon</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {(["ingredient", "supply"] as const).map((group) => {
          const list = materials(group);
          if (list.length === 0) return null;
          return (
            <section key={group} className="flex flex-col gap-2">
              <h2 className="font-display text-[20px] font-semibold">{group === "ingredient" ? "Raw materials" : "Packaging"}</h2>
              <ul className="flex flex-col divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/15 bg-card">
                {list.map((s, i) => {
                  const m: RawMaterialStock = s.material;
                  const threshold = m.reorderPoint ?? m.lowStockThreshold;
                  const low = threshold > 0 && s.onHand <= threshold;
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                      <PhotoButton id={m.id} photo={photos[m.id]} fallbackIndex={i + 3} size="h-11 w-11" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{m.name}</p>
                        {low && <Pill tone={s.onHand <= 0 ? "bad" : "warn"}>{s.onHand <= 0 ? "Out" : "Running low"}</Pill>}
                      </div>
                      <span className="text-[18px] font-bold tabular-nums">{Math.round(s.onHand * 100) / 100}</span>
                      {exec ? (
                        <UnitPicker value={m.unit} options={MATERIAL_UNITS} onChange={(u) => updateRawMaterial(m.id, { unit: u })} />
                      ) : (
                        <span className="text-[13px] text-muted-foreground">{m.unit}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {view !== "all" && <p className="text-[12px] text-muted-foreground">Raw materials and packaging are counted for the whole shop, not per branch.</p>}
            </section>
          );
        })}
      </div>

      {dialog === "add" && <AddStockAtBranch branches={branches} defaultBranch={view === "all" ? mainBranch(branches).id : view} onClose={() => setDialog(null)} />}
      {dialog === "move" && <MoveStock branches={branches} byBranch={byBranch} onClose={() => setDialog(null)} />}
      {dialog === "branches" && <BranchesDialog branches={branches} onClose={() => setDialog(null)} />}
    </Page>
  );
}

function ProductSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { products } = useStore();
  const families = familiesOf(products).sort((a, b) => a.head.name.localeCompare(b.head.name));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-[15px]">
      {families.map(({ head, all }) =>
        all.length === 1 ? (
          <option key={head.id} value={head.id}>
            {fullName(head, products)}
          </option>
        ) : (
          <optgroup key={head.id} label={head.name}>
            {all.map((p) => (
              <option key={p.id} value={p.id}>
                {head.name} · {sizeName(p)}
              </option>
            ))}
          </optgroup>
        ),
      )}
    </select>
  );
}

const fieldCls = "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao";
const labelCls = "flex flex-col gap-1 text-[13px] font-semibold";

/** Stock coming in — a batch made, or stock received — at a branch. */
function AddStockAtBranch({ branches, defaultBranch, onClose }: { branches: Branch[]; defaultBranch: string; onClose: () => void }) {
  const { products } = useStore();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [branch, setBranch] = useState(defaultBranch);
  const product = products.find((p) => p.id === productId);
  const n = Number(qty);

  function save() {
    if (!product || !(n > 0)) return;
    const unit = product.unit || "jars";
    addEntry({
      ...blankEntryDraft("INVENTORY_IN", `Added ${n} ${unit} of ${fullName(product, products)}`),
      sku: product.name,
      quantity: n,
      unit,
      branch: branch === mainBranch(branches).id ? null : branch,
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add stock</DialogTitle>
          <DialogDescription>A batch made, or stock received. Making a batch uses up its ingredients.</DialogDescription>
        </DialogHeader>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a product first, in Costing.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <label className={labelCls}>
              Product
              <ProductSelect value={productId} onChange={setProductId} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelCls}>
                How many ({product?.unit || "jars"})
                <input autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="e.g. 40" className={fieldCls} />
              </label>
              {branches.length > 1 && (
                <label className={labelCls}>
                  At
                  <select value={branch} onChange={(e) => setBranch(e.target.value)} className={fieldCls}>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={!(n > 0)} onClick={save} className="min-h-11 flex-1 rounded-[10px] bg-cacao text-[14px] font-semibold text-ivory disabled:opacity-40">
                Save
              </button>
              <button type="button" onClick={onClose} className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold">
                Cancel
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Stock shipped from one branch to another. */
function MoveStock({ branches, byBranch, onClose }: { branches: Branch[]; byBranch: Record<string, Record<string, number>>; onClose: () => void }) {
  const { products } = useStore();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [from, setFrom] = useState(branches[0].id);
  const [to, setTo] = useState(branches[1]?.id ?? branches[0].id);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const available = byBranch[productId]?.[from] ?? 0;
  const product = products.find((p) => p.id === productId);

  function save() {
    const n = Number(qty);
    if (from === to) return setError("Pick two different branches.");
    if (!(n > 0)) return setError("How many?");
    if (n > available) return setError(`Only ${available} at ${branches.find((b) => b.id === from)?.name}.`);
    const d = new Date();
    addStockTransfer({ productId, fromBranch: from, toBranch: to, quantity: n, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, note: note.trim() });
    onClose();
  }

  const branchSelect = (value: string, set: (v: string) => void, label: string) => (
    <label className={labelCls}>
      {label}
      <select value={value} onChange={(e) => set(e.target.value)} className={fieldCls}>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move stock</DialogTitle>
          <DialogDescription>Shipped from one branch to another. The total stays the same.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className={labelCls}>
            Product
            <ProductSelect value={productId} onChange={setProductId} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {branchSelect(from, setFrom, "From")}
            {branchSelect(to, setTo, "To")}
          </div>
          <label className={labelCls}>
            How many ({product?.unit || "jars"}) · {available} at {branches.find((b) => b.id === from)?.name}
            <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))} className={fieldCls} />
          </label>
          <label className={labelCls}>
            Note
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. via LBC" className={fieldCls} />
          </label>
          {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} className="min-h-11 flex-1 rounded-[10px] bg-cacao text-[14px] font-semibold text-ivory">
              Move
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

/** Executives: the list of branches, in any country. The first is the main branch. */
function BranchesDialog({ branches, onClose }: { branches: Branch[]; onClose: () => void }) {
  const [list, setList] = useState<Branch[]>(branches);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("Philippines");

  function add() {
    if (!name.trim()) return;
    setList((prev) => [...prev, { id: newBranchId(name, prev), name: name.trim(), country: country.trim() || "Philippines" }]);
    setName("");
  }
  function save() {
    setBusinessSetting(BRANCHES_KEY, JSON.stringify(list));
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Branches</DialogTitle>
          <DialogDescription>The first one is the main branch — stock recorded without a branch is counted there.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y divide-line/10 rounded-xl border border-line/15">
          {list.map((b, i) => (
            <li key={b.id} className="flex items-center gap-2 px-3 py-2">
              <input value={b.name} onChange={(e) => setList((prev) => prev.map((x) => (x.id === b.id ? { ...x, name: e.target.value } : x)))} className="h-10 min-w-0 flex-1 rounded-md border border-line/20 bg-transparent px-2 text-[14px]" />
              <input value={b.country} onChange={(e) => setList((prev) => prev.map((x) => (x.id === b.id ? { ...x, country: e.target.value } : x)))} className="h-10 w-28 rounded-md border border-line/20 bg-transparent px-2 text-[14px]" aria-label="Country" />
              {i === 0 ? (
                <span className="text-[11px] font-bold text-cacao">MAIN</span>
              ) : (
                <button type="button" onClick={() => setList((prev) => [b, ...prev.filter((x) => x.id !== b.id)])} className="text-[12px] font-semibold text-cacao">
                  Make main
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-[1fr_120px_auto] gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New branch, e.g. Cebu" className={fieldCls} />
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className={fieldCls} />
          <button type="button" onClick={add} className="min-h-11 rounded-[10px] border border-line/20 px-3 text-[14px] font-semibold">
            Add
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground">A branch can be renamed, but not removed once it has stock — move its stock to another branch first.</p>
        <div className="flex gap-2">
          <button type="button" onClick={save} className="min-h-11 flex-1 rounded-[10px] bg-cacao text-[14px] font-semibold text-ivory">
            Save
          </button>
          <button type="button" onClick={onClose} className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold">
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
