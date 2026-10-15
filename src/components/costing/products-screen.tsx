"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { MaterialsPanel } from "@/components/products/materials-panel";
import { familiesOf, sizeName, type ProductFamily } from "@/lib/summary/product-sizes";
import { ArrowRight, Check, Package, Plus } from "lucide-react";
import { Page } from "@/components/layout/page";
import { useCatalogUpdate } from "@/components/costing/catalog-update";
import { AddProductDialog } from "@/components/stock/edit-product-dialog";
import { useStore } from "@/lib/store/use-store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { setProductPhoto, shrinkImage, useProductPhotos } from "@/lib/products/photos";
import { formatPrice, pluralize } from "@/lib/format";
import type { Product } from "@/lib/store/types";

/** Shown behind the icon when a product has no photo yet, cycling by position. */
export const GRADIENTS = [
  "from-[#7B4B2A] to-[#5A3620]",
  "from-[#A9754A] to-[#7B4B2A]",
  "from-[#5E4536] to-[#3D3D3A]",
  "from-[#788C5D] to-[#556943]",
  "from-[#C46686] to-[#9C4E68]",
  "from-[#6B4D9E] to-[#4A3570]",
  "from-[#C08552] to-[#96633B]",
  "from-[#4D3B2F] to-[#2A2019]",
];

export function ProductPhoto({ product, gradient, photo }: { product: Product; gradient: string; photo: string | undefined }) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      if (!setProductPhoto(product.id, await shrinkImage(file))) {
        alert("Couldn't save the photo — browser storage is full. Remove another photo and try again.");
      }
    } catch {
      alert("That file couldn't be read as a photo — try a JPG or PNG.");
    }
  }

  return (
    <div className="group relative h-[120px]">
      {photo ? (
        // A data URL from the owner's own upload; next/image can't optimise these.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={product.name} className="h-full w-full object-cover" />
      ) : (
        <div className={`flex h-full items-center justify-center bg-gradient-to-br ${gradient}`}>
          <Package className="h-11 w-11 text-ivory" strokeWidth={1.4} />
        </div>
      )}
      <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-90 group-hover:opacity-100">
        {photo && (
          <button
            type="button"
            onClick={() => setProductPhoto(product.id, null)}
            className="rounded-md bg-card/90 px-2.5 py-1 text-[11px] font-semibold text-danger shadow-sm"
          >
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-md bg-card/90 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-sm"
        >
          {photo ? "Change photo" : "+ Add photo"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Which list the Products, Raw materials and Packaging sub-tabs show. */
export type CostingList = "products" | "ingredient" | "supply";

/**
 * The executive's Costing lists: products (SKUs), raw materials and packaging — the inputs
 * every price is worked out from. One list per sub-tab; the carousel that used to rotate
 * through them was a second way of doing what the Costing tabs now do.
 *
 * Products are split in two: the ones that still need something come first, under "To finish",
 * then the ones "Ready to sell". A line at the top says how many are ready. Each card reads top
 * to bottom — name, its sizes, then three figures (sells for, costs to make, you keep) and stock
 * — and ends in one line: either "Ready to sell" or the single next thing to do. Tapping it opens
 * its page (`onOpenPricing`), where the recipe, cost, price, stock, sizes and name settings live.
 */
export function ProductsScreen({
  subnav,
  list,
  onOpenPricing,
}: {
  subnav?: ReactNode;
  list: CostingList;
  onOpenPricing: (productId: string) => void;
}) {
  const { products } = useStore();
  const costCtx = useCostContext();
  const photos = useProductPhotos();
  const [adding, setAdding] = useState(false);
  const families = familiesOf(products);
  // Only executives reach this screen (employees get the gallery), so this runs as one.
  useCatalogUpdate(true);

  // Each family's card, with where it stands worked out once.
  const cards = families.map((family, i) => ({ family, i, ...standing(family.head, costCtx) }));
  const toFinish = cards.filter((c) => c.next !== null);
  const ready = cards.filter((c) => c.next === null);
  const grid = "grid grid-cols-1 gap-4 min-[600px]:grid-cols-2 min-[1000px]:grid-cols-3 min-[1300px]:grid-cols-4";
  const card = (c: (typeof cards)[number]) => (
    <ProductCard key={c.family.head.id} {...c} photo={photos[c.family.head.id]} onOpen={() => onOpenPricing(c.family.head.id)} />
  );

  return (
    <Page title="Costing" subnav={subnav} hideModeToggle>
      {list === "products" && (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-muted-foreground">
            {products.length === 0 ? (
              "No products yet. Add what you sell, then its recipe — the cost and price follow from that."
            ) : (
              <>
                <span className="font-semibold text-foreground">
                  {ready.length} of {cards.length}
                </span>{" "}
                {cards.length === 1 ? "product is" : "products are"} ready to sell
                {toFinish.length > 0 && " · tap a product to finish it"}
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-10 items-center gap-1.5 rounded-[10px] bg-cacao px-4 text-[14px] font-semibold text-ivory"
          >
            <Plus className="h-4 w-4" /> Add product
          </button>
        </div>

        {toFinish.length > 0 && (
          <section className="flex flex-col gap-2.5" aria-labelledby="to-finish">
            <h2 id="to-finish" className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
              To finish · {toFinish.length}
            </h2>
            <div className={grid}>{toFinish.map(card)}</div>
          </section>
        )}
        {ready.length > 0 && (
          <section className="flex flex-col gap-2.5" aria-labelledby="ready">
            <h2 id="ready" className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
              Ready to sell · {ready.length}
            </h2>
            <div className={grid}>{ready.map(card)}</div>
          </section>
        )}
      </div>
      )}

      {list === "ingredient" && <MaterialsPanel group="ingredient" />}
      {list === "supply" && <MaterialsPanel group="supply" />}

      {adding && <AddProductDialog products={products} onClose={() => setAdding(false)} />}
    </Page>
  );
}

/** Where a product stands: its figures, and the one thing it needs next (null when it's ready). */
function standing(p: Product, costCtx: ReturnType<typeof useCostContext>) {
  const cost = productCostPerJar(p, costCtx);
  const price = effectiveProductPrice(p, cost);
  const noRecipe = p.recipeIngredients.length === 0 && (p.recipeComponents ?? []).length === 0;
  const complete = cost.unpriced.length === 0 && cost.unconvertible.length === 0 && p.recipeIngredients.length > 0;
  // Per unit, whatever the batch size (lib/costing/per-unit).
  const unitCost = complete ? Math.round(cost.costPerJar * 100) / 100 : null;
  const next = noRecipe
    ? "Add the recipe"
    : cost.unpriced.length > 0
      ? `Add a price for ${cost.unpriced.length === 1 ? cost.unpriced[0] : pluralize(cost.unpriced.length, "ingredient")}`
      : cost.unconvertible.length > 0
        ? "Check the ingredient units"
        : price <= 0
            ? "Set a selling price"
            : null;
  return { price, unitCost, next };
}

function ProductCard({
  family,
  i,
  price,
  unitCost,
  next,
  photo,
  onOpen,
}: {
  family: ProductFamily;
  i: number;
  price: number;
  unitCost: number | null;
  next: string | null;
  photo: string | undefined;
  onOpen: () => void;
}) {
  const p = family.head;
  const unit = (p.unit || "jar").replace(/s$/, "");
  const keep = unitCost != null && price > 0 ? price - unitCost : null;
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line/15 bg-card transition hover:border-cacao/40 hover:shadow-sm">
      <ProductPhoto product={p} gradient={GRADIENTS[i % GRADIENTS.length]} photo={photo} />
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col text-left">
        <span className="flex flex-col gap-1.5 px-4 pt-3">
          <span className="text-[16px] font-semibold leading-tight">{p.name}</span>
          {family.sizes.length > 0 && (
            <span className="flex flex-wrap items-center gap-1">
              <span className="text-[11.5px] text-muted-foreground">Sizes</span>
              {family.all.map((s) => (
                <span key={s.id} className="rounded-full bg-secondary px-2 py-0.5 text-[11.5px] font-medium">
                  {sizeName(s)}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="grid grid-cols-3 gap-2 px-4 py-3">
          <Figure label="Sells for" value={price > 0 ? formatPrice(price) : null} />
          <Figure label="Costs" value={unitCost != null ? formatPrice(unitCost) : null} />
          <Figure label="You keep" value={keep != null ? formatPrice(keep) : null} tone={keep == null ? undefined : keep >= 0 ? "good" : "bad"} />
        </span>
        <span className="mt-auto flex items-center justify-between gap-2 border-t border-line/10 px-4 py-2.5 text-[13px]">
          {next ? (
            <span className="flex min-w-0 items-center gap-1 font-semibold text-cacao">
              <span className="truncate">Next: {next}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            </span>
          ) : (
            <span className="flex items-center gap-1 font-semibold text-success">
              <Check className="h-3.5 w-3.5" strokeWidth={3} /> Ready to sell
            </span>
          )}
          <span className="shrink-0 text-[12px] text-muted-foreground">{pluralize(p.stockQty, unit)} on hand</span>
        </span>
      </button>
    </div>
  );
}

/** A small figure on a card; "Not yet" when there's nothing to show, instead of a dash. */
function Figure({ label, value, tone }: { label: string; value: string | null; tone?: "good" | "bad" }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={
          value == null
            ? "text-[13px] text-muted-foreground/70"
            : `text-[14.5px] font-semibold tabular-nums ${tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : ""}`
        }
      >
        {value ?? "Not yet"}
      </span>
    </span>
  );
}
