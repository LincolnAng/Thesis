"use client";

import { useSyncExternalStore } from "react";

/** Home sections the owner can hide. Each one is remembered separately, in this browser only. */
export type HomeSection = "glance" | "overview";

const STORAGE_KEY = "mang-kikos-cocoa-home-hidden-v1";
const EMPTY: Record<string, boolean> = {};

let hidden: Record<string, boolean> = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function ensureLoaded() {
  if (typeof window === "undefined" || loaded) return;
  loaded = true;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) hidden = JSON.parse(saved);
  } catch {
    // storage unavailable — show everything
  }
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSectionHidden(section: HomeSection, next: boolean) {
  hidden = { ...hidden, [section]: next };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden));
  } catch {
    // storage unavailable — the choice lasts until reload
  }
  listeners.forEach((l) => l());
}

export function useSectionHidden(section: HomeSection): boolean {
  const all = useSyncExternalStore(
    subscribe,
    () => {
      ensureLoaded();
      return hidden;
    },
    () => EMPTY,
  );
  return all[section] === true;
}
