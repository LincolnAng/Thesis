"use client";

import { useSyncExternalStore } from "react";

/**
 * Profile photos, kept in this browser's storage and keyed by user id.
 *
 * Per device on purpose, like product photos: the Users sheet holds a name and four digits,
 * and a spreadsheet cell is no place for an image. The consequence is honest and worth
 * knowing — a photo set on the shop tablet does not follow that person to another device.
 */
const STORAGE_KEY = "mang-kikos-cocoa-profile-photos-v1";
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

export function useProfilePhotos(): Record<string, string> {
  return useSyncExternalStore(
    subscribe,
    () => {
      ensureLoaded();
      return photos;
    },
    () => EMPTY,
  );
}

/** False when the browser refused to store it — usually a full quota. */
export function setProfilePhoto(userId: string, dataUrl: string | null): boolean {
  ensureLoaded();
  const next = { ...photos };
  if (dataUrl) next[userId] = dataUrl;
  else delete next[userId];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  photos = next;
  listeners.forEach((l) => l());
  return true;
}
