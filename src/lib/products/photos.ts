"use client";

import { useSyncExternalStore } from "react";

/**
 * Photos of products, raw materials and packaging, keyed by the item's id. Saved in the
 * spreadsheet (via /api/photos) so every device shows the same picture; this browser keeps a
 * copy to show them instantly. Photos are shrunk to a small JPEG before saving.
 */
const STORAGE_KEY = "mang-kikos-cocoa-product-photos-v1";
const EMPTY: Record<string, string> = {};

let photos: Record<string, string> = EMPTY;
let loaded = false;
let fetched = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function cache() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
  } catch {
    // storage full — the sheet still has them
  }
}

function ensureLoaded() {
  if (typeof window === "undefined" || loaded) return;
  loaded = true;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) photos = JSON.parse(saved);
  } catch {
    // storage unavailable — the sheet's copy arrives below
  }
  if (fetched) return;
  fetched = true;
  void fetch("/api/photos")
    .then((r) => r.json())
    .then((j) => {
      if (!j?.success || typeof j.photos !== "object") return;
      // A photo only on this device (saved before photos were shared) is sent up once.
      const localOnly = Object.entries(photos).filter(([id]) => !(id in j.photos));
      photos = { ...j.photos };
      for (const [id, url] of localOnly) void setProductPhoto(id, url);
      cache();
      notify();
    })
    .catch(() => undefined);
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useProductPhotos(): Record<string, string> {
  return useSyncExternalStore(
    subscribe,
    () => {
      ensureLoaded();
      return photos;
    },
    () => EMPTY,
  );
}

/** Saves (or with null, removes) an item's photo for everyone. Resolves false if it didn't save. */
export async function setProductPhoto(itemId: string, dataUrl: string | null): Promise<boolean> {
  const next = { ...photos };
  if (dataUrl) next[itemId] = dataUrl;
  else delete next[itemId];
  photos = next;
  cache();
  notify();
  try {
    const res = await fetch("/api/photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: itemId, dataUrl }) });
    return Boolean((await res.json())?.success);
  } catch {
    return false;
  }
}

/** Shrinks a photo to a small JPEG (at most 320px) that fits in one spreadsheet cell. */
export function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Not an image"));
      img.onload = () => {
        for (const [size, quality] of [
          [320, 0.72],
          [260, 0.62],
          [200, 0.55],
          [160, 0.5],
        ] as const) {
          const scale = Math.min(1, size / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const url = canvas.toDataURL("image/jpeg", quality);
          if (url.length <= 48_000 || size === 160) return resolve(url);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
