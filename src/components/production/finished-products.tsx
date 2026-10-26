"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { useStore } from "@/lib/store/use-store";
import { familiesOf, fullName, sizeName } from "@/lib/summary/product-sizes";
import { PackagingEditor, fieldCls, recipePackaging, type PackagingLine } from "@/components/production/add-batch-dialog";
import type { Product, RawMaterialStock } from "@/lib/store/types";

/** One finished product made, and the packaging it went into. */
export interface Made {
  qty: number;
  /** Null until changed by hand: then it follows the recipe for how many were made. */
  packaging: PackagingLine[] | null;
}

/** What was picked, in Inventory's order, so the list under the dropdown reads like it. */
export function madeLines(made: Record<string, Made>, products: Product[]) {
  return familiesOf(products)
    .sort((a, b) => a.head.name.localeCompare(b.head.name))
    .flatMap((f) => f.all)
    .filter((p) => (made[p.id]?.qty ?? 0) > 0)
    .map((p) => ({ product: p, ...made[p.id] }));
}

export type MadeLine = ReturnType<typeof madeLines>[number];

/** The packaging a line used: as changed by hand, or the recipe's for how many were made. */
export function linePackaging(l: MadeLine, materials: RawMaterialStock[]): PackagingLine[] {
  return l.packaging ?? recipePackaging(l.product, l.qty, materials);
}

/**
 * Every product as Inventory lists it — each family with its sizes — in one dropdown, each with
 * how many were made. Anything above zero is in the run.
 */
function ProductsDropdown({ made, onChange }: { made: Record<string, Made>; onChange: (id: string, qty: number) => void }) {
  const { products } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // Typing narrows the list to the families or sizes that match.
  const families = familiesOf(products)
    .sort((a, b) => a.head.name.localeCompare(b.head.name))
    .map((f) => ({ ...f, all: f.all.filter((p) => !q || fullName(p, products).toLowerCase().includes(q)) }))
    .filter((f) => f.all.length > 0);
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
        <div className="max-h-80 overflow-y-auto rounded-lg border border-line/20 bg-card pb-1 shadow-sm">
          <div className="sticky top-0 z-10 border-b border-line/10 bg-card">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" aria-label="Search products" className="h-10 w-full bg-transparent pl-9 pr-3 text-[14px] outline-none" />
          </div>
          {families.length === 0 && (
            <p className="px-3 py-2 text-[13px] text-muted-foreground">{products.length === 0 ? "No products in Inventory yet." : `Nothing matches “${query.trim()}”.`}</p>
          )}
          {families.map(({ head, all }) =>
            all.length === 1 && all[0].id === head.id ? (
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
 * The finished products made — Log production's, and tingi repacked: the dropdown of every
 * product with how many, then each picked one with the packaging it went into.
 */
export function FinishedProducts({ made, setMade }: { made: Record<string, Made>; setMade: (update: (m: Record<string, Made>) => Record<string, Made>) => void }) {
  const { products, rawMaterials } = useStore();
  return (
    <>
      <ProductsDropdown made={made} onChange={(id, qty) => setMade((m) => ({ ...m, [id]: { qty, packaging: m[id]?.packaging ?? null } }))} />
      {madeLines(made, products).map((l) => (
        <div key={l.product.id} className="flex flex-col gap-1.5 border-t border-line/10 pt-2.5">
          <div className="flex items-baseline justify-between gap-2 text-[14px]">
            <span className="truncate font-semibold">{fullName(l.product, products)}</span>
            <span className="shrink-0 tabular-nums">
              {l.qty} <span className="text-muted-foreground">{l.product.unit || "jars"}</span>
            </span>
          </div>
          <div className="text-[12px] font-semibold text-muted-foreground">Packaging used</div>
          <PackagingEditor lines={linePackaging(l, rawMaterials)} onChange={(pk) => setMade((m) => ({ ...m, [l.product.id]: { ...m[l.product.id], packaging: pk } }))} />
        </div>
      ))}
    </>
  )
}
