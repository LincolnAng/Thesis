"use client";

import { useSyncExternalStore } from "react";

/**
 * Who is using this device right now.
 *
 * Kept per device rather than per account: the shop has one tablet that several people
 * share, so "signed in" means "this is who's holding it", and it survives a reload until
 * somebody switches. Deliberately knows nothing about the data store — the store imports
 * this to stamp the activity log, so the dependency only goes one way.
 */

export interface SignedInUser {
  id: string;
  name: string;
  role: "owner" | "helper";
}

const STORAGE_KEY = "mang-kikos-cocoa-current-user-v1";

let current: SignedInUser | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function read(): SignedInUser | null {
  if (hydrated) return current;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    current = raw ? (JSON.parse(raw) as SignedInUser) : null;
  } catch {
    current = null;
  }
  return current;
}

function emit() {
  for (const listener of listeners) listener();
}

export function currentUser(): SignedInUser | null {
  if (typeof window === "undefined") return null;
  return read();
}

export function signIn(user: SignedInUser) {
  current = user;
  hydrated = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Private browsing — they stay signed in for this tab only.
  }
  emit();
}

export function signOut() {
  current = null;
  hydrated = true;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCurrentUser(): SignedInUser | null {
  // The server has no idea who's holding the tablet, so it renders nobody and the client
  // fills it in on hydration.
  return useSyncExternalStore(subscribe, currentUser, () => null);
}

/**
 * The stored form of a PIN: SHA-256 over the person's id and their four digits, so the
 * same PIN under two names doesn't produce the same hash. An empty PIN hashes to "" —
 * that's the "no PIN set" case, and the sign-in screen lets it straight through.
 */
export async function hashPin(userId: string, pin: string): Promise<string> {
  const digits = pin.trim();
  if (!digits) return "";
  const bytes = new TextEncoder().encode(`${userId}:${digits}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
