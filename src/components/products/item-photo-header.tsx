"use client";

import { useRef, type ReactNode } from "react";
import { Camera, X } from "lucide-react";
import { setProductPhoto, shrinkImage, useProductPhotos } from "@/lib/products/photos";

/**
 * The picture at the top of a card in a photo grid — a raw material, a piece of packaging. Shows
 * its photo if one was added, otherwise the coloured tile with its icon, and lets anyone add,
 * change or remove the photo. Photos are shared with every device (lib/products/photos), so the
 * same picture shows in Costing and Inventory.
 */
export function ItemPhotoHeader({ itemId, name, fallback, className = "h-[120px]" }: { itemId: string; name: string; fallback: ReactNode; className?: string }) {
  const photos = useProductPhotos();
  const photo = photos[itemId];
  const input = useRef<HTMLInputElement>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    try {
      if (!(await setProductPhoto(itemId, await shrinkImage(file)))) alert("The photo shows here but didn't save for everyone — check the internet and try again.");
    } catch {
      alert("That file couldn't be read as a photo — try a JPG or PNG.");
    }
  }

  return (
    <div className={`relative ${className}`}>
      {photo ? (
        // A small data URL from the shop's own upload; next/image can't optimise these.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={name} className="h-full w-full object-cover" />
      ) : (
        fallback
      )}
      <div className="absolute bottom-2 right-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex min-h-8 items-center gap-1 rounded-lg bg-white/90 px-2.5 text-[12px] font-semibold text-foreground shadow-sm hover:bg-white"
        >
          <Camera className="h-3.5 w-3.5" />
          {photo ? "Change photo" : "Add photo"}
        </button>
        {photo && (
          <button
            type="button"
            aria-label={`Remove the photo of ${name}`}
            title="Remove photo"
            onClick={() => void setProductPhoto(itemId, null)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-muted-foreground shadow-sm hover:bg-white hover:text-danger"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => (void handle(e.target.files?.[0]), (e.target.value = ""))} />
    </div>
  );
}
