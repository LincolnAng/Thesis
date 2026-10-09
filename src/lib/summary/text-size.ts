"use client";

import { useSyncExternalStore } from "react";

/**
 * How big the type is, app-wide.
 *
 * Everything in this app is sized in rem, so the root font size is the one lever that moves
 * all of it together — text, padding, the gaps between cards — instead of leaving big text
 * crammed into layouts built for small text. The default stays where it was so nobody's
 * screen changes under them; this is for the person who has to read it across a market stall.
 */

export type TextSize = "small" | "medium" | "large";

const STORAGE_KEY = "mang-kikos-cocoa-text-size-v1";

/** Percentages of the browser's own base, so a device that is already set large stays large. */
export const TEXT_SCALE: Record<TextSize, string> = {
  small: "100%",
  medium: "112.5%",
  large: "125%",
};

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

// Server render and the client's first render must agree, so this is always the default; the
// stored value is read right after hydration, like every other per-device preference here.
const serverSnapshot: TextSize = "small";

let size: TextSize = serverSnapshot;
let loaded = false;
const listeners = new Set<() => void>();

function isSize(value: string | null): value is TextSize {
  return value === "small" || value === "medium" || value === "large";
}

function ensureLoaded() {
  if (typeof window === "undefined" || loaded) return;
  loaded = true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSize(stored)) size = stored;
  } catch {
    // localStorage unavailable — stay on the default
  }
}

function subscribe(listener: () => void): () => void {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): TextSize {
  ensureLoaded();
  return size;
}

function getServerSnapshot(): TextSize {
  return serverSnapshot;
}

export function applyTextSize(next: TextSize) {
  if (typeof document === "undefined") return;
  document.documentElement.style.fontSize = TEXT_SCALE[next];
}

function setTextSize(next: TextSize) {
  size = next;
  applyTextSize(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // storage unavailable — the change still holds for this session
  }
  listeners.forEach((l) => l());
}

/** Per-device display preference (not business data — never synced to Google Sheets). */
export function useTextSize(): [TextSize, (size: TextSize) => void] {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [current, setTextSize];
}
