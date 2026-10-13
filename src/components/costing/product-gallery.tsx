"use client";

import { Package } from "lucide-react";
import { Page } from "@/components/layout/page";
import { useStore } from "@/lib/store/use-store";
import { useProductPhotos } from "@/lib/products/photos";
import { profileColor } from "@/lib/auth/profile-colors";

/**
 * Costing as an employee sees it: what the shop sells — photo, name, size — and nothing about
 * what it costs. Read-only. The server never sends an employee costs in the first place (see
 * lib/auth/permissions), so this is the whole of what there is to show, not a filtered view.
 */
export function ProductGallery() {
  const { products } = useStore();
  const photos = useProductPhotos();

  return (
    <Page title="Costing" hideModeToggle>
      {products.length === 0 ? (
        <div className="rounded-2xl border border-line/15 bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No products yet. An Executive adds them here.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-4">
          {products.map((p, i) => (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-line/15 bg-card">
              <div className="h-[120px]">
                {photos[p.id] ? (
                  // A data URL from the owner's own upload; next/image can't optimise these.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photos[p.id]} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center" style={{ background: profileColor(undefined, i) }}>
                    <Package className="h-11 w-11 text-ivory" strokeWidth={1.4} />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-0.5 p-4">
                <span className="font-display text-[16px] font-semibold leading-tight">{p.name}</span>
                {p.sizeLabel && <span className="text-xs text-muted-foreground">{p.sizeLabel}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
