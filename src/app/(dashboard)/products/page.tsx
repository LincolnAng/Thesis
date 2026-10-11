"use client";

import { useRef, useState } from "react";
import { MaterialsPanel } from "@/components/products/materials-panel";
import { ProductExpiryStrip } from "@/components/products/product-expiry-strip";
import { SizeStrip } from "@/components/products/size-strip";
import { familiesOf } from "@/lib/summary/product-sizes";
import { SimpleInventory } from "@/components/simple/simple-inventory";
import { CarouselNav } from "@/components/ui/carousel-nav";
import { Package } from "lucide-react";
import { Page } from "@/components/layout/page";
import { AddProductDialog, EditProductDialog } from "@/components/stock/edit-product-dialog";
import { useStore } from "@/lib/store/use-store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { setProductPhoto, shrinkImage, useProductPhotos } from "@/lib/products/photos";
import { formatPrice, pluralize } from "@/lib/format";
import type { Product } from "@/lib/store/types";
import { useViewMode } from "@/lib/summary/view-mode";

/** Shown behind the icon when a product has no photo yet, cycling by position. */
const GRADIENTS = [
  "from-[#7B4B2A] to-[#5A3620]",
  "from-[#A9754A] to-[#7B4B2A]",
  "from-[#5E4536] to-[#3D3D3A]",
  "from-[#788C5D] to-[#556943]",
  "from-[#C46686] to-[#9C4E68]",
  "from-[#6B4D9E] to-[#4A3570]",
  "from-[#C08552] to-[#96633B]",
  "from-[#4D3B2F] to-[#2A2019]",
];

function ProductPhoto({ product, gradient, photo }: { product: Product; gradient: string; photo: string | undefined }) {
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

export default function ProductsPage() {
  const { products } = useStore();
  const costCtx = useCostContext();
  const photos = useProductPhotos();
  const [viewMode] = useViewMode();
  const simple = viewMode === "simple";
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = products.find((p) => p.id === editingId) ?? null;
  const [section, setSection] = useState(0);
  const families = familiesOf(products);
  // Everything production runs on, on one page and in the order it is used: what she sells,
  // what goes in it, what it is packed in. Stock answers "how much is left"; this answers
  // "what is it made of". Three tabs made that one question into three errands.
  // One section at a time. Stacked, the three grids ran to three screens of scrolling for a
  // shop with three products and six materials, and the one you wanted was never the one on
  // screen. Rotating keeps each list whole and the page one screen tall.
  // "Everything" first, so the carousel has a home position and opening the page still shows
  // the whole picture — rotating is for narrowing down, not the only way to see things.
  const SECTIONS = ["Everything", "Products", "Raw materials", "Supplies"] as const;
  const rotate = (step: number) => setSection((n) => (n + step + SECTIONS.length) % SECTIONS.length);

  if (simple) {
    return (
      <Page title="Products">
        <SimpleInventory onAddProduct={() => setAdding(true)} onEditProduct={setEditingId} />
        {adding && <AddProductDialog products={products} onClose={() => setAdding(false)} />}
        {editing && (
          <EditProductDialog key={editing.id} product={editing} products={products} onClose={() => setEditingId(null)} />
        )}
      </Page>
    );
  }

  return (
    <Page title="Products">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <CarouselNav
          label={SECTIONS[section]}
          onPrev={() => rotate(-1)}
          onNext={() => rotate(1)}
          wrap
          size="large"
          labelWidth="min-w-[170px]"
          prevLabel="Previous section"
          nextLabel="Next section"
        />
        {/* Dots, so a carousel that wraps still says where you are and how many there are —
            otherwise rotating past the end feels like the page is looping without end. */}
        <div className="flex items-center gap-2">
          {SECTIONS.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => setSection(i)}
              aria-label={`Show ${name}`}
              aria-current={i === section}
              className={`h-2 rounded-full transition-all ${i === section ? "w-6 bg-cacao" : "w-2 bg-line/30 hover:bg-cacao/40"}`}
            />
          ))}
        </div>
      </div>

      {section === 0 && (
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Products</div>
      )}
      {(section === 0 || section === 1) && (
      <div className="grid grid-cols-1 gap-[18px] min-[600px]:grid-cols-2 min-[1000px]:grid-cols-3 min-[1300px]:grid-cols-4">
        {families.map(({ head: p, sizes }, i) => {
          const cost = productCostPerJar(p, costCtx);
          const price = effectiveProductPrice(p, cost);
          const marginPct = price > 0 ? ((price - cost.costPerJar) / price) * 100 : 0;
          const low = p.stockQty <= p.lowStockThreshold;
          // Half a recipe priced is not a margin, it is a flattering guess. Say what is missing.
          const costable = cost.unpriced.length === 0;
          return (
            <div
              key={p.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-line/15 bg-card transition hover:border-cacao/40 hover:shadow-sm"
            >
              <ProductPhoto product={p} gradient={GRADIENTS[i % GRADIENTS.length]} photo={photos[p.id]} />
              <button type="button" onClick={() => setEditingId(p.id)} title="Edit product" className="flex flex-col gap-1.5 p-4 text-left">
                <div className="flex w-full items-start justify-between gap-2">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <span className="shrink-0 text-[11px] font-semibold text-faint">Edit</span>
                </div>
                {simple ? (
                  <div className="flex flex-col gap-1 text-[13px]">
                    <span>
                      Sells for <span className="font-bold">{formatPrice(price)}</span>
                    </span>
                    <span className={low ? "font-semibold text-danger" : "text-muted-foreground"}>
                      {pluralize(p.stockQty, "jar")} on the shelf{low ? " — running low" : ""}
                    </span>
                    <span className={`font-semibold ${!costable ? "text-[#9A6B12]" : price - cost.costPerJar > 0 ? "text-success" : "text-danger"}`}>
                      {!costable
                        ? `Can't work this out until you log buying ${cost.unpriced.join(", ")}`
                        : price - cost.costPerJar > 0
                          ? `You keep ${formatPrice(price - cost.costPerJar)} a jar`
                          : "It costs more to make than it sells for"}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex w-full justify-between text-[13px]">
                      <span className="font-bold">{formatPrice(price)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${low ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
                        {pluralize(p.stockQty, "jar")}{low ? " left" : ""}
                      </span>
                    </div>
                    {costable ? (
                      <div className={`text-xs font-semibold ${marginPct >= 15 ? "text-success" : "text-danger"}`}>
                        {Math.round(marginPct)}% margin
                      </div>
                    ) : (
                      <div className="text-xs font-semibold text-[#9A6B12]">
                        {`No margin yet — nothing bought for ${cost.unpriced.join(", ")}`}
                      </div>
                    )}
                  </>
                )}
              </button>
              <ProductExpiryStrip product={p} />
              <SizeStrip head={p} sizes={sizes} onOpen={setEditingId} />
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
      )}

      {(section === 0 || section === 2) && (
        <div className={section === 0 ? "mt-8" : ""}>
          {section === 0 && (
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Raw materials</div>
          )}
          <MaterialsPanel group="ingredient" />
        </div>
      )}
      {(section === 0 || section === 3) && (
        <div className={section === 0 ? "mt-8" : ""}>
          {section === 0 && (
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Supplies</div>
          )}
          <MaterialsPanel group="supply" />
        </div>
      )}

      {adding && <AddProductDialog products={products} onClose={() => setAdding(false)} />}
      {editing && <EditProductDialog key={editing.id} product={editing} products={products} onClose={() => setEditingId(null)} />}
    </Page>
  );
}
