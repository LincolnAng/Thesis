"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store/use-store";
import { addEntry, addTingiMove } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { familiesOf, fullName, sizeName } from "@/lib/summary/product-sizes";
import { shelfLifeDays } from "@/lib/summary/business-config";
import { branchesOf, mainBranch } from "@/lib/inventory/branches";
import { unitsPerBatch } from "@/lib/costing/per-unit";
import type { Product, RawMaterialStock } from "@/lib/store/types";

export const fieldCls = "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao";
export const labelCls = "flex flex-col gap-1 text-[13px] font-semibold";
export const TINGI_UNITS = ["g", "kg", "pcs", "mL", "L"];

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const num = (s: string) => Number(s) || 0;

/** A product and its sizes, one dropdown. */
export function ProductPicker({ value, onChange, className = fieldCls }: { value: string; onChange: (id: string) => void; className?: string }) {
  const { products } = useStore();
  const families = familiesOf(products).sort((a, b) => a.head.name.localeCompare(b.head.name));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
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

export interface PackagingLine {
  materialId: string;
  qty: string;
}

/** The packaging a product's recipe uses for this many units — what the form starts with. */
export function recipePackaging(product: Product | undefined, units: number, materials: RawMaterialStock[]): PackagingLine[] {
  if (!product) return [];
  return product.recipeIngredients
    .filter((r) => materials.find((m) => m.id === r.materialId)?.kind === "packaging")
    .map((r) => ({ materialId: r.materialId, qty: String(Math.round(((r.quantity * units) / unitsPerBatch(product)) * 100) / 100) }));
}

/** Which packaging was used and how much — taken off the packaging stock when saved. */
export function PackagingEditor({ lines, onChange }: { lines: PackagingLine[]; onChange: (lines: PackagingLine[]) => void }) {
  const { rawMaterials } = useStore();
  const packaging = rawMaterials.filter((m) => m.kind === "packaging");
  if (packaging.length === 0) return <p className="text-[12.5px] text-muted-foreground">No packaging set up yet — add it under Inventory.</p>;
  const set = (i: number, patch: Partial<PackagingLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <select value={l.materialId} onChange={(e) => set(i, { materialId: e.target.value })} className={`${fieldCls} min-w-0 flex-1`}>
            {packaging.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input inputMode="decimal" value={l.qty} onChange={(e) => set(i, { qty: e.target.value.replace(/[^0-9.]/g, "") })} className={`${fieldCls} w-20`} aria-label="How many" />
          <span className="w-12 truncate text-[12.5px] text-muted-foreground">{packaging.find((m) => m.id === l.materialId)?.unit}</span>
          <button type="button" aria-label="Remove" onClick={() => onChange(lines.filter((_, j) => j !== i))} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...lines, { materialId: packaging[0].id, qty: "" }])}
        className="flex items-center gap-1 self-start text-[13px] font-semibold text-cacao"
      >
        <Plus className="h-4 w-4" /> Add packaging
      </button>
    </div>
  );
}

export const packagingUsed = (lines: PackagingLine[]) => lines.filter((l) => num(l.qty) > 0).map((l) => ({ materialId: l.materialId, qty: num(l.qty) }));

/**
 * Add: a batch that was just made. No price — that's set in Costing. It says how many finished
 * units came out, how much was left loose (tingi, into that product's bucket), the lot number
 * and expiry on the label, and the packaging it went into, which comes off the packaging stock.
 * The ingredients come off by the recipe, as for any batch.
 */
export function AddBatchDialog({ onClose }: { onClose: () => void }) {
  const { products, rawMaterials, entries, businessSettings } = useStore();
  const today = new Date();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = products.find((p) => p.id === productId);
  const unit = product?.unit || "jars";
  const [finished, setFinished] = useState("");
  const [tingi, setTingi] = useState("");
  const [tingiUnit, setTingiUnit] = useState("g");
  const madeToday = entries.filter((e) => e.type === "INVENTORY_IN" && e.timestamp.slice(0, 10) === isoDay(today)).length;
  const [lotId, setLotId] = useState(`LOT-${isoDay(today).replace(/-/g, "")}-${madeToday + 1}`);
  const defaultExpiry = (id: string) => isoDay(addDays(today, shelfLifeDays(businessSettings, id)));
  const [expiresOn, setExpiresOn] = useState(() => (productId ? defaultExpiry(productId) : ""));
  const [packaging, setPackaging] = useState<PackagingLine[]>([]);
  const [packagingTouched, setPackagingTouched] = useState(false);
  const branches = branchesOf(businessSettings);
  const [branch, setBranch] = useState(mainBranch(branches)?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  // Until it's changed by hand, the packaging follows the recipe for how many were made.
  const shownPackaging = packagingTouched ? packaging : recipePackaging(product, num(finished), rawMaterials);

  function pickProduct(id: string) {
    setProductId(id);
    setExpiresOn(defaultExpiry(id));
    setPackagingTouched(false);
  }

  function save() {
    if (!product) return;
    const n = num(finished);
    const loose = num(tingi);
    if (!(n > 0) && !(loose > 0)) return setError("How many were made?");
    if (!lotId.trim()) return setError("Give it a lot number.");
    const date = isoDay(today);
    if (n > 0) {
      addEntry({
        ...blankEntryDraft("INVENTORY_IN", `Made ${n} ${unit} of ${fullName(product, products)} · lot ${lotId.trim()}`),
        sku: product.name,
        quantity: n,
        unit,
        branch: branch && branch !== mainBranch(branches)?.id ? branch : null,
        lotId: lotId.trim(),
        expiresOn: expiresOn || null,
        packagingUsed: packagingUsed(shownPackaging),
      });
    }
    if (loose > 0) {
      addTingiMove({ productId: product.id, direction: "in", qty: loose, unit: tingiUnit, date, lotId: lotId.trim(), usedForProductId: null, note: "" });
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add</DialogTitle>
          <DialogDescription>A batch you just made. The ingredients come off by the recipe; the packaging you list comes off too.</DialogDescription>
        </DialogHeader>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a product first, in Costing.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <label className={labelCls}>
              Product
              <ProductPicker value={productId} onChange={pickProduct} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelCls}>
                Finished ({unit})
                <input autoFocus inputMode="decimal" value={finished} onChange={(e) => setFinished(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="e.g. 40" className={fieldCls} />
              </label>
              <label className={labelCls}>
                Tingi (loose)
                <span className="flex gap-1.5">
                  <input inputMode="decimal" value={tingi} onChange={(e) => setTingi(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className={`${fieldCls} min-w-0`} />
                  <select value={tingiUnit} onChange={(e) => setTingiUnit(e.target.value)} className={`${fieldCls} w-[72px] px-2`} aria-label="Tingi unit">
                    {[...new Set([...TINGI_UNITS, unit])].map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </span>
              </label>
              <label className={labelCls}>
                Lot ID
                <input value={lotId} onChange={(e) => setLotId(e.target.value)} className={fieldCls} />
              </label>
              <label className={labelCls}>
                Expires
                <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={fieldCls} />
              </label>
            </div>
            <div className={labelCls}>
              Packaging used
              <PackagingEditor
                lines={shownPackaging}
                onChange={(l) => {
                  setPackaging(l);
                  setPackagingTouched(true);
                }}
              />
            </div>
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
        )}
      </DialogContent>
    </Dialog>
  );
}
