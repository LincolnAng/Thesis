"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { MaterialsPanel } from "@/components/products/materials-panel";
import { familiesOf, sizeTag } from "@/lib/summary/product-sizes";
import { CircleAlert, Package } from "lucide-react";
import { Page } from "@/components/layout/page";
import { useCatalogUpdate } from "@/components/costing/catalog-update";
import { AddProductDialog } from "@/components/stock/edit-product-dialog";
import { useStore } from "@/lib/store/use-store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { costPerUnit } from "@/lib/costing/price-calc";
import { setProductPhoto, shrinkImage, useProductPhotos } from "@/lib/products/photos";
import { formatPrice } from "@/lib/format";
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
 * Each card reads top to bottom: the name (with its size, if it has one), what it sells for and
 * what it costs to make, then one badge for where it stands — a green Ready, or in amber the one
 * thing it still needs, so a pending task stands out without looking like an error. Tapping it opens its page (`onOpenPricing`), which is where the recipe,
 * cost, price, stock, sizes and name settings live.
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

  return (
    <Page title="Costing" subnav={subnav} hideModeToggle>
      {list === "products" && (
      <>
      {products.length === 0 && (
        <div className="mb-4 rounded-2xl border border-line/15 bg-card px-6 py-8 text-center text-sm text-muted-foreground">
          No products yet. Add what you sell, then its recipe — the cost and price follow from that.
        </div>
      )}
      <div className="grid grid-cols-1 gap-[18px] min-[600px]:grid-cols-2 min-[1000px]:grid-cols-3 min-[1300px]:grid-cols-4">
        {families.map(({ head: p }, i) => {
          const cost = productCostPerJar(p, costCtx);
          const price = effectiveProductPrice(p, cost);
          const noRecipe = p.recipeIngredients.length === 0 && (p.recipeComponents ?? []).length === 0;
          const complete = cost.unpriced.length === 0 && cost.unconvertible.length === 0 && p.recipeIngredients.length > 0;
          const unitCost = costPerUnit(cost.batchTotal, p.batchYield, complete);
          const size = sizeTag(p.sizeLabel);
          // One word for where it stands, so a beginner can see what to do next without reading figures.
          const status = noRecipe
            ? { text: "Needs a recipe", ready: false }
            : cost.unpriced.length > 0
              ? { text: "Needs ingredient prices", ready: false }
              : price <= 0
                ? { text: "Needs a price", ready: false }
                : { text: "Ready", ready: true };
          return (
            <div
              key={p.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-line/15 bg-card transition hover:border-cacao/40 hover:shadow-sm"
            >
              <ProductPhoto product={p} gradient={GRADIENTS[i % GRADIENTS.length]} photo={photos[p.id]} />
              <button type="button" onClick={() => onOpenPricing(p.id)} className="flex flex-1 flex-col gap-3 p-4 text-left">
                <span className="text-[16px] font-bold leading-snug hover:text-cacao">
                  {p.name}
                  {size && <span className="font-medium text-muted-foreground"> · {size}</span>}
                </span>
                <span className="grid grid-cols-2 gap-3">
                  <Figure label="Sells for" value={price > 0 ? formatPrice(price) : null} empty="No price set" />
                  <Figure label="Costs to make" value={unitCost != null ? formatPrice(unitCost) : null} empty="Not worked out yet" />
                </span>
                <span
                  className={`mt-auto inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                    status.ready
                      ? "bg-success/10 text-success"
                      : "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-400/25"
                  }`}
                >
                  {status.ready ? "✓" : <CircleAlert className="h-3.5 w-3.5" />}
                  {status.text}
                </span>
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="min-h-[220px] rounded-2xl border border-dashed border-line/25 text-sm font-semibold text-muted-foreground transition hover:border-cacao/40 hover:text-cacao"
        >
          + Add product
        </button>
      </div>
      </>
      )}

      {list === "ingredient" && <MaterialsPanel group="ingredient" />}
      {list === "supply" && <MaterialsPanel group="supply" />}

      {adding && <AddProductDialog products={products} onClose={() => setAdding(false)} />}
    </Page>
  );
}

/** A small labelled figure on a card, or plain words when there is nothing to show yet. */
function Figure({ label, value, empty }: { label: string; value: string | null; empty: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {value != null ? (
        <span className="text-[15px] font-bold tabular-nums">{value}</span>
      ) : (
        <span className="text-[13px] leading-snug text-muted-foreground">{empty}</span>
      )}
    </span>
  );
}
