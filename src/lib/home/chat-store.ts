import { formatDateShort, formatTime } from "@/lib/format";
import type { ChatMessage, DistributiveOmit } from "./chat-types";

// If the last message is older than this when the app is reopened, we mark the gap
// with an automatic divider instead of silently continuing as if no time had passed.
const REOPEN_DIVIDER_THRESHOLD_MS = 30 * 60 * 1000;

// Purely a paint-speed cache — never trusted as the source of truth. Read once to
// paint instantly on load, then always overwritten with whatever Google Sheets says,
// even if that's empty. If the sheet is cleared, the next load clears this too.
const PAINT_CACHE_KEY = "mang-kikos-cocoa-chat-paint-cache-v1";

const INITIAL_SESSION_ID = "__initial__";

export const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  kind: "text",
  text: 'Hi! Tell me about a sale or a purchase, like "sold 12 jars to Aling Nena, wholesale, 2160". You can also ask things like "how much did I make this week?"',
  // Fixed, not "now" — this is evaluated at module load on both server and client,
  // and must match exactly to avoid a hydration mismatch. Shown as a placeholder while
  // the real history is still loading from Google Sheets (the only source of truth).
  createdAt: "2026-01-01T00:00:00.000Z",
  sessionId: INITIAL_SESSION_ID,
};

function genSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readPaintCache(): ChatMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PAINT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as ChatMessage[]) : null;
  } catch {
    return null;
  }
}

function writePaintCache(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PAINT_CACHE_KEY, JSON.stringify(messages));
  } catch {
    // storage full/unavailable — fine, it's disposable, Sheets is unaffected
  }
}

function formatDividerLabel(lastCreatedAt: string): string {
  const then = new Date(lastCreatedAt);
  const now = new Date();
  const crossedDay = then.toDateString() !== now.toDateString() || now.getTime() - then.getTime() > 24 * 60 * 60 * 1000;
  return crossedDay ? `${formatDateShort(lastCreatedAt)} · ${formatTime(lastCreatedAt)}` : formatTime(lastCreatedAt);
}

// The server (and the client's very first render, before hydration) always see this
// fixed snapshot. Only after the real history loads from Sheets does the client swap
// it in — this is what keeps chat history from causing a hydration mismatch.
const serverSnapshot: ChatMessage[] = [GREETING];

let rawMessages: ChatMessage[] = serverSnapshot; // every message this account has ever sent, any session
let currentSessionId: string = INITIAL_SESSION_ID;
let visibleMessages: ChatMessage[] = serverSnapshot; // memoized: rawMessages filtered to the current session
let loadStarted = false;
let ready = false; // true once the initial Sheets load has settled — gates sending
let reopenCheckDone = false;
const listeners = new Set<() => void>();

function recomputeVisible() {
  const filtered = rawMessages.filter((m) => m.sessionId === currentSessionId);
  visibleMessages = filtered.length > 0 ? filtered : [GREETING];
}

export interface ChatSession {
  id: string;
  label: string;
  createdAt: string;
}

function truncateLabel(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Memoized on (rawMessages, currentSessionId) so useSyncExternalStore gets a stable
// reference between renders instead of a fresh array (and an infinite update loop).
let sessionsCache: { forRawMessages: ChatMessage[]; forCurrentSessionId: string; sessions: ChatSession[] } | null = null;

function computeSessions(): ChatSession[] {
  if (
    sessionsCache &&
    sessionsCache.forRawMessages === rawMessages &&
    sessionsCache.forCurrentSessionId === currentSessionId
  ) {
    return sessionsCache.sessions;
  }

  const order: string[] = [];
  const createdAtById = new Map<string, string>();
  const firstUserTextById = new Map<string, string>();
  for (const m of rawMessages) {
    if (m.sessionId === INITIAL_SESSION_ID) continue; // the fixed greeting placeholder, not a real session
    if (!createdAtById.has(m.sessionId)) {
      createdAtById.set(m.sessionId, m.createdAt);
      order.push(m.sessionId);
    }
    if (m.kind === "text" && m.role === "user" && !firstUserTextById.has(m.sessionId)) {
      firstUserTextById.set(m.sessionId, m.text);
    }
  }
  // A brand-new chat has no messages yet — still list it, so it doesn't vanish the
  // moment it's created.
  if (!createdAtById.has(currentSessionId)) {
    createdAtById.set(currentSessionId, new Date().toISOString());
    order.push(currentSessionId);
  }

  const sessions = order.map((id, index) => ({
    id,
    createdAt: createdAtById.get(id)!,
    label: firstUserTextById.has(id) ? truncateLabel(firstUserTextById.get(id)!, 28) : `Chat ${index + 1}`,
  }));
  sessionsCache = { forRawMessages: rawMessages, forCurrentSessionId: currentSessionId, sessions };
  return sessions;
}

export function getSessionsSnapshot(): ChatSession[] {
  ensureLoadStarted();
  return computeSessions();
}

export function getSessionsServerSnapshot(): ChatSession[] {
  return [];
}

export function getCurrentSessionIdSnapshot(): string {
  ensureLoadStarted();
  return currentSessionId;
}

export function getCurrentSessionIdServerSnapshot(): string {
  return INITIAL_SESSION_ID;
}

export function getReadySnapshot(): boolean {
  ensureLoadStarted();
  return ready;
}

export function getReadyServerSnapshot(): boolean {
  return false;
}

/**
 * If the app was closed and reopened after a real gap, mark it with a divider showing
 * when the conversation was last active — rather than silently picking up as if no
 * time had passed. Runs once, right after the initial load.
 */
function maybeInsertReopenDivider() {
  const currentSessionMessages = rawMessages.filter((m) => m.sessionId === currentSessionId);
  const last = currentSessionMessages[currentSessionMessages.length - 1];
  if (!last || last.kind === "divider") return;

  const gap = Date.now() - new Date(last.createdAt).getTime();
  if (gap < REOPEN_DIVIDER_THRESHOLD_MS) return;

  const divider: ChatMessage = {
    id: `divider-${Date.now()}`,
    kind: "divider",
    createdAt: new Date().toISOString(),
    label: formatDividerLabel(last.createdAt),
    sessionId: currentSessionId,
  };
  rawMessages = [...rawMessages, divider];
  void mirrorAppend(divider);
}

/** Picks which session to land on after loading history: whichever session's most
 * recent message is the most recent overall. A brand-new, never-saved session if
 * there's no history yet at all. */
function pickDefaultSessionId(messages: ChatMessage[]): string {
  let latestId: string | null = null;
  let latestTime = -Infinity;
  for (const m of messages) {
    if (m.sessionId === INITIAL_SESSION_ID) continue;
    const t = new Date(m.createdAt).getTime();
    if (t >= latestTime) {
      latestTime = t;
      latestId = m.sessionId;
    }
  }
  return latestId ?? genSessionId();
}

/**
 * Google Sheets is the only source of truth for chat history. This loads the full
 * history (every session) once, on first use, and picks the most recently active
 * session as the starting tab. Whatever Sheets says here always wins over the paint
 * cache — including "nothing," so a cleared sheet correctly clears the app too.
 */
async function loadFromServer() {
  try {
    const res = await fetch("/api/chat-history");
    const json = await res.json();
    if (json.success && Array.isArray(json.messages)) {
      const messages = json.messages as ChatMessage[];
      rawMessages = messages.length > 0 ? messages : [GREETING];
      currentSessionId = messages.length > 0 ? pickDefaultSessionId(messages) : genSessionId();
    } else {
      // Sheets unreachable — keep whatever the paint cache already showed (better
      // than nothing) and start a fresh session so new messages don't silently
      // attach to history we can't actually confirm is current.
      currentSessionId = genSessionId();
    }
  } catch {
    currentSessionId = genSessionId();
  }

  if (!reopenCheckDone) {
    reopenCheckDone = true;
    maybeInsertReopenDivider();
  }

  recomputeVisible();
  writePaintCache(rawMessages);
  ready = true;
  listeners.forEach((l) => l());
}

async function mirrorAppend(message: ChatMessage) {
  try {
    await fetch("/api/chat-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  } catch {
    // Sheets is still the source of truth — if this fails, the message survives in
    // this tab's paint cache (so it isn't lost on an immediate reload), but it was
    // never actually saved, so it won't show up on any other device.
  }
}

async function mirrorUpdate(id: string, message: ChatMessage) {
  try {
    await fetch("/api/chat-history", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, message }),
    });
  } catch {
    // best-effort — see mirrorAppend
  }
}

async function mirrorRemove(id: string) {
  try {
    await fetch("/api/chat-history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  } catch {
    // best-effort — see mirrorAppend
  }
}

function ensureLoadStarted() {
  if (typeof window === "undefined") return;
  if (!loadStarted) {
    loadStarted = true;
    // Paint whatever we last saw instantly, while the authoritative fetch runs in the
    // background — this is a guess, not confirmed truth, so sending still waits for
    // `ready` (set once loadFromServer resolves) to avoid tagging a message to a
    // session Sheets hasn't actually confirmed is current.
    const cached = readPaintCache();
    if (cached) {
      rawMessages = cached;
      currentSessionId = pickDefaultSessionId(cached);
      recomputeVisible();
    }
    void loadFromServer();
  }
}

export function subscribe(listener: () => void): () => void {
  ensureLoadStarted();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): ChatMessage[] {
  ensureLoadStarted();
  return visibleMessages;
}

export function getServerSnapshot(): ChatMessage[] {
  return serverSnapshot;
}

function mutate(updater: (prev: ChatMessage[]) => ChatMessage[]) {
  ensureLoadStarted();
  rawMessages = updater(rawMessages);
  recomputeVisible();
  writePaintCache(rawMessages);
  listeners.forEach((l) => l());
}

export function pushChatMessage(message: DistributiveOmit<ChatMessage, "sessionId">) {
  ensureLoadStarted();
  const stamped = { ...message, sessionId: currentSessionId } as ChatMessage;
  mutate((prev) => [...prev, stamped]);
  void mirrorAppend(stamped);
}

export function replaceChatMessage(id: string, message: DistributiveOmit<ChatMessage, "sessionId">) {
  ensureLoadStarted();
  const existing = rawMessages.find((m) => m.id === id);
  const stamped = { ...message, sessionId: existing?.sessionId ?? currentSessionId } as ChatMessage;
  mutate((prev) => prev.map((m) => (m.id === id ? stamped : m)));
  void mirrorUpdate(id, stamped);
}

export function removeChatMessage(id: string) {
  mutate((prev) => prev.filter((m) => m.id !== id));
  void mirrorRemove(id);
}

/** Starts a completely separate conversation, listed on the left alongside every other
 * one. Nothing is deleted or hidden — it just isn't saved to Sheets until its first
 * real message is sent. */
export function startNewChat() {
  ensureLoadStarted();
  currentSessionId = genSessionId();
  recomputeVisible();
  listeners.forEach((l) => l());
}

/** Switches the active conversation to a different, already-existing session. All
 * sessions are loaded up front, so this is an instant local switch, no refetch. */
export function switchToSession(id: string) {
  ensureLoadStarted();
  if (id === currentSessionId) return;
  currentSessionId = id;
  recomputeVisible();
  listeners.forEach((l) => l());
}
