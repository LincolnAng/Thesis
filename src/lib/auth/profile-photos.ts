"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { updateUser } from "@/lib/store/store";
import { useStore } from "@/lib/store/use-store";

/**
 * Profile photos, kept in the Users sheet so a face set on one device shows on every device.
 *
 * They used to live in this browser's storage only, which made every profile look different
 * depending on which tablet you picked up — one more way profiles seemed to belong to a device
 * rather than to the shop. A photo is now shrunk to a small square and saved on the person's
 * row in the sheet.
 *
 * Photos saved the old way are still read from this browser, and uploaded to the sheet the
 * first time the app sees one with no sheet copy, so nobody has to set their face again.
 */
const LEGACY_STORAGE_KEY = "mang-kikos-cocoa-profile-photos-v1";
const AVATAR_SIDE = 160;
const EMPTY: Record<string, string> = {};

let legacy: Record<string, string> = EMPTY;
let legacyLoaded = false;
const listeners = new Set<() => void>();

function loadLegacy() {
  if (typeof window === "undefined" || legacyLoaded) return;
  legacyLoaded = true;
  try {
    const saved = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (saved) legacy = JSON.parse(saved);
  } catch {
    // storage unavailable — no old photos to carry over
  }
}

function forgetLegacy(userId: string) {
  if (!(userId in legacy)) return;
  const next = { ...legacy };
  delete next[userId];
  legacy = next;
  try {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // nothing to do: the sheet copy is what counts now
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  loadLegacy();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every profile's photo by user id: the sheet's copy, or this browser's old one until it uploads. */
export function useProfilePhotos(): Record<string, string> {
  const { users, serverLoad } = useStore();
  const old = useSyncExternalStore(
    subscribe,
    () => {
      loadLegacy();
      return legacy;
    },
    () => EMPTY,
  );

  // Carry old browser-only photos up to the sheet, once the sheet has answered and still has none.
  useEffect(() => {
    if (serverLoad !== "ok") return;
    for (const user of users) {
      const local = old[user.id];
      if (!local) continue;
      if (user.photo) {
        forgetLegacy(user.id);
        continue;
      }
      void squareFromDataUrl(local).then((small) => {
        updateUser(user.id, { photo: small });
        forgetLegacy(user.id);
      });
    }
  }, [users, old, serverLoad]);

  return useMemo(() => {
    const out: Record<string, string> = { ...old };
    for (const user of users) if (user.photo) out[user.id] = user.photo;
    return out;
  }, [users, old]);
}

/** Saves a new photo (or removes it, with null) on the person's row in the sheet. */
export async function setProfilePhoto(userId: string, file: File | null): Promise<void> {
  const photo = file ? await squareFromDataUrl(await readAsDataUrl(file)) : "";
  updateUser(userId, { photo: photo || undefined });
  forgetLegacy(userId);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** Centre-crops to a square and shrinks to AVATAR_SIDE px — about 10 KB as a JPEG, small
 * enough for one spreadsheet cell. */
function squareFromDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Not an image"));
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_SIDE;
      canvas.height = AVATAR_SIDE;
      canvas
        .getContext("2d")
        ?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.src = src;
  });
}
