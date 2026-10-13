"use client";

import { useSyncExternalStore } from "react";
import type { Role } from "@/lib/store/types";

/**
 * Who is using this device right now.
 *
 * The server decides: signing in checks the PIN there and sets a signed cookie, and every
 * data request is answered for that cookie's profile (see lib/auth/session.ts). What's kept
 * here is a copy for painting the screen before the server answers — the shop has one tablet
 * that several people share, so "signed in" still means "this is who's holding it", and it
 * survives a reload until somebody switches.
 *
 * Deliberately knows nothing about the data store — the store imports this to stamp the
 * activity log, so the dependency only goes one way.
 */

export interface SignedInUser {
  id: string;
  name: string;
  role: Role;
}

const STORAGE_KEY = "mang-kikos-cocoa-current-user-v2";

/**
 * Everything this device keeps that came from a signed-in profile's view of the business.
 * Wiped whenever the person holding the tablet changes, so an employee signing in after an
 * executive can't find the executive's numbers in the browser's storage. (Keys are owned by
 * lib/store/store.ts and lib/home/chat-store.ts.)
 */
const PRIVATE_CACHE_KEYS = [
  "mang-kikos-cocoa-state-v6",
  "mang-kikos-cocoa-chat-paint-cache-v1",
  "mang-kikos-cocoa-current-user-v1",
];

let current: SignedInUser | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function read(): SignedInUser | null {
  if (hydrated) return current;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as SignedInUser) : null;
    current = parsed && parsed.id && parsed.role ? parsed : null;
  } catch {
    current = null;
  }
  return current;
}

function emit() {
  for (const listener of listeners) listener();
}

function remember(user: SignedInUser | null) {
  current = user;
  hydrated = true;
  try {
    if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing — they stay signed in for this tab only.
  }
  emit();
}

function wipePrivateCaches() {
  try {
    for (const key of PRIVATE_CACHE_KEYS) window.localStorage.removeItem(key);
  } catch {
    // nothing to clear
  }
}

export function currentUser(): SignedInUser | null {
  if (typeof window === "undefined") return null;
  return read();
}

export function isExecutive(user: SignedInUser | null): boolean {
  return user?.role === "executive";
}

/**
 * Checks the PIN on the server. On success the page reloads, so nothing loaded for the
 * previous person stays in memory.
 */
export async function signInWithPin(userId: string, pin: string): Promise<{ ok: true } | { ok: false; reason: string; retryInSeconds?: number }> {
  try {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, pin }),
    });
    const json = await res.json();
    if (!json.success) return { ok: false, reason: json.reason ?? "failed", retryInSeconds: json.retryInSeconds };
    wipePrivateCaches();
    remember({ id: json.user.id, name: json.user.name, role: json.user.role });
    window.location.reload();
    return { ok: true };
  } catch {
    return { ok: false, reason: "offline" };
  }
}

/** For the first profile, which the server signs in as it creates it. */
export function adoptSignedInProfile(user: SignedInUser) {
  wipePrivateCaches();
  remember(user);
  window.location.reload();
}

export async function signOut() {
  try {
    await fetch("/api/auth/session", { method: "DELETE" });
  } catch {
    // The cookie expires on its own; the local copy goes regardless.
  }
  wipePrivateCaches();
  remember(null);
  window.location.reload();
}

/**
 * Re-asks the server who this device is signed in as, once per page load. A cookie that
 * expired, or a profile deleted on another device, signs this one out; a role changed
 * elsewhere is picked up here.
 */
let verified = false;
export async function verifySession(): Promise<void> {
  if (verified || typeof window === "undefined") return;
  verified = true;
  try {
    const res = await fetch("/api/auth/session");
    const json = await res.json();
    if (!json.success) return;
    const user = json.user as SignedInUser | null;
    const local = read();
    if (!user) {
      if (local) {
        wipePrivateCaches();
        remember(null);
      }
      return;
    }
    if (!local || local.id !== user.id || local.role !== user.role || local.name !== user.name) {
      if (local && local.id !== user.id) wipePrivateCaches();
      remember({ id: user.id, name: user.name, role: user.role });
    }
  } catch {
    // Offline: keep the local copy; the server will still refuse anything it shouldn't serve.
  }
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
