"use client";

import { useRef, useState } from "react";
import { Package } from "lucide-react";
import { Page } from "@/components/layout/page";
import { AddProductDialog, EditProductDialog } from "@/components/stock/edit-product-dialog";
import { useStore } from "@/lib/store/use-store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { setProductPhoto, shrinkImage, useProductPhotos } from "@/lib/products/photos";
import { formatPeso } from "@/lib/format";
import type { Product } from "@/lib/store/types";

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
            className="rounded-md bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-danger shadow-sm"
          >
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-md bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-sm"
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
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = products.find((p) => p.id === editingId) ?? null;

  return (
    <Page
      title="Products"
      right={
        <button type="button" onClick={() => setAdding(true)} className="rounded-[10px] bg-cacao px-[18px] py-2.5 text-[13px] font-semibold text-ivory">
          + Add product
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-[18px] min-[600px]:grid-cols-2 min-[1000px]:grid-cols-3 min-[1300px]:grid-cols-4">
        {products.map((p, i) => {
          const cost = productCostPerJar(p, costCtx);
          const price = effectiveProductPrice(p, cost);
          const marginPct = price > 0 ? ((price - cost.costPerJar) / price) * 100 : 0;
          const low = p.stockQty <= p.lowStockThreshold;
          return (
            <div
              key={p.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-line/15 bg-white transition hover:border-cacao/40 hover:shadow-sm"
            >
              <ProductPhoto product={p} gradient={GRADIENTS[i % GRADIENTS.length]} photo={photos[p.id]} />
              <button type="button" onClick={() => setEditingId(p.id)} title="Edit product" className="flex flex-col gap-1.5 p-4 text-left">
                <div className="flex w-full items-start justify-between gap-2">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <span className="shrink-0 text-[11px] font-semibold text-faint">Edit</span>
                </div>
                <div className="flex w-full justify-between text-[13px]">
                  <span className="font-bold">{formatPeso(price)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${low ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
                    {p.stockQty} jars{low ? " left" : ""}
                  </span>
                </div>
                <div className={`text-xs font-semibold ${marginPct >= 15 ? "text-success" : "text-danger"}`}>{Math.round(marginPct)}% margin</div>
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

      {adding && <AddProductDialog products={products} onClose={() => setAdding(false)} />}
      {editing && <EditProductDialog key={editing.id} product={editing} products={products} onClose={() => setEditingId(null)} />}
    </Page>
  );
}
