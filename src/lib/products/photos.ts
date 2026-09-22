"use client";

import { useSyncExternalStore } from "react";

/**
 * Product photos, kept in this browser's storage and keyed by product id. Photos are
 * shrunk before saving so several fit in the ~5MB storage quota.
 */
const STORAGE_KEY = "mang-kikos-cocoa-product-photos-v1";
const EMPTY: Record<string, string> = {};

let photos: Record<string, string> = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function ensureLoaded() {
  if (typeof window === "undefined" || loaded) return;
  loaded = true;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) photos = JSON.parse(saved);
  } catch {
    // storage unavailable — no photos this session
  }
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

/** Saves (or with null, removes) a product's photo. Returns false if storage is full. */
export function setProductPhoto(productId: string, dataUrl: string | null): boolean {
  const next = { ...photos };
  if (dataUrl) next[productId] = dataUrl;
  else delete next[productId];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  photos = next;
  listeners.forEach((l) => l());
  return true;
}

/** Shrinks a photo to at most 640px wide as a JPEG, so a multi-MB phone photo fits in storage. */
export function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Not an image"));
      img.onload = () => {
        const scale = Math.min(1, 640 / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
