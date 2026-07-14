"use client";

import { useSyncExternalStore } from "react";

export type ViewMode = "simple" | "advanced";

const STORAGE_KEY = "mang-kikos-cocoa-view-mode-v1";

// Server render and the client's pre-hydration first render must agree, so this is
// always "simple" — the real value (if "advanced") is read from localStorage lazily,
// right after hydration, same as every other client-only store in this app.
const serverSnapshot: ViewMode = "simple";

let mode: ViewMode = serverSnapshot;
let loaded = false;
const listeners = new Set<() => void>();

function ensureLoaded() {
  if (typeof window === "undefined" || loaded) return;
  loaded = true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "simple" || stored === "advanced") mode = stored;
  } catch {
    // localStorage unavailable — stay on the default
  }
}

function subscribe(listener: () => void): () => void {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ViewMode {
  ensureLoaded();
  return mode;
}

function getServerSnapshot(): ViewMode {
  return serverSnapshot;
}

function setViewMode(next: ViewMode) {
  mode = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // storage full/unavailable — the mode still works for the rest of this session
  }
  listeners.forEach((l) => l());
}

/** Per-device display preference (not business data — never synced to Google Sheets). */
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [current, setViewMode];
}
