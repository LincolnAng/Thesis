import { formatDateShort, formatTime } from "@/lib/format";
import type { ChatMessage, DistributiveOmit } from "./chat-types";

const STORAGE_KEY = "mang-kikos-cocoa-chat-v1";
const SESSION_KEY = "mang-kikos-cocoa-chat-session-v1";

// If the last message is older than this when the app is reopened, we mark the gap
// with an automatic divider instead of silently continuing as if no time had passed.
const REOPEN_DIVIDER_THRESHOLD_MS = 30 * 60 * 1000;

const INITIAL_SESSION_ID = "__initial__";

export const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  kind: "text",
  text: 'Hi! Tell me about a sale or a purchase, like "sold 12 jars to Aling Nena, wholesale, 2160". You can also ask things like "how much did I make this week?"',
  // Fixed, not "now" — this is evaluated at module load on both server and client,
  // and must match exactly to avoid a hydration mismatch. It's shown as a placeholder
  // whenever the current session has no real messages yet, not tied to any real session.
  createdAt: "2026-01-01T00:00:00.000Z",
  sessionId: INITIAL_SESSION_ID,
};

function genSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadRawMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [GREETING];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [GREETING];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as ChatMessage[]) : [GREETING];
  } catch {
    return [GREETING];
  }
}

function loadSessionId(): string {
  if (typeof window === "undefined") return genSessionId();
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
  } catch {
    // ignore, fall through to generating a fresh one
  }
  const fresh = genSessionId();
  persistSessionId(fresh);
  return fresh;
}

function persistSessionId(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_KEY, id);
  } catch {
    // storage full or unavailable - fail silently, session still works in-memory
  }
}

function persistMessages(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // storage full or unavailable - fail silently, chat still works in-memory
  }
}

function formatDividerLabel(lastCreatedAt: string): string {
  const then = new Date(lastCreatedAt);
  const now = new Date();
  const crossedDay = then.toDateString() !== now.toDateString() || now.getTime() - then.getTime() > 24 * 60 * 60 * 1000;
  return crossedDay ? `${formatDateShort(lastCreatedAt)} · ${formatTime(lastCreatedAt)}` : formatTime(lastCreatedAt);
}

// The server (and the client's very first render, before hydration) always see this
// fixed snapshot. Only after mount does the client swap in whatever was actually
// saved, via useSyncExternalStore's dual-snapshot support — this is what keeps chat
// history from causing a hydration mismatch.
const serverSnapshot: ChatMessage[] = [GREETING];

let rawMessages: ChatMessage[] = serverSnapshot; // every message this browser has ever seen, any session
let currentSessionId: string = INITIAL_SESSION_ID;
let visibleMessages: ChatMessage[] = serverSnapshot; // memoized: rawMessages filtered to the current session
let hydrated = false;
let serverSyncStarted = false;
let reopenCheckDone = false;
const listeners = new Set<() => void>();

function recomputeVisible() {
  const filtered = rawMessages.filter((m) => m.sessionId === currentSessionId);
  visibleMessages = filtered.length > 0 ? filtered : [GREETING];
}

/**
 * If the app was closed and reopened after a real gap, mark it with a divider showing
 * when the conversation was last active — rather than silently picking up as if no
 * time had passed. Runs once, right after hydration.
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
  recomputeVisible();
  persistMessages(rawMessages);
  void mirrorAppend(divider);
}

/**
 * Merges in whatever's saved in Google Sheets (the durable, cross-device copy) without
 * discarding anything local — local wins on id conflicts, so an in-flight message that
 * hasn't finished mirroring yet is never wiped out by a stale server read. Only messages
 * from the current session are pulled in, so switching to a new chat doesn't resurrect
 * an older, intentionally-hidden conversation.
 */
async function syncFromServer() {
  try {
    const res = await fetch("/api/chat-history");
    const json = await res.json();
    if (!json.success || !Array.isArray(json.messages) || json.messages.length === 0) return;
    const serverMessages = (json.messages as ChatMessage[]).filter((m) => m.sessionId === currentSessionId);
    if (serverMessages.length === 0) return;

    const byId = new Map(serverMessages.map((m) => [m.id, m]));
    for (const m of rawMessages) byId.set(m.id, m);
    rawMessages = Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    recomputeVisible();
    persistMessages(rawMessages);
    listeners.forEach((l) => l());
  } catch {
    // Sheets unreachable/not configured — keep using local history only.
  }
}

async function mirrorAppend(message: ChatMessage) {
  try {
    await fetch("/api/chat-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  } catch {
    // best-effort — local storage already has it
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
    // best-effort — local storage already has it
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
    // best-effort — local storage already reflects the removal
  }
}

function ensureHydrated() {
  if (typeof window === "undefined") return;
  if (!hydrated) {
    rawMessages = loadRawMessages();
    currentSessionId = loadSessionId();
    recomputeVisible();
    hydrated = true;
  }
  if (!reopenCheckDone) {
    reopenCheckDone = true;
    maybeInsertReopenDivider();
  }
  if (!serverSyncStarted) {
    serverSyncStarted = true;
    void syncFromServer();
  }
}

export function subscribe(listener: () => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): ChatMessage[] {
  ensureHydrated();
  return visibleMessages;
}

export function getServerSnapshot(): ChatMessage[] {
  return serverSnapshot;
}

function mutate(updater: (prev: ChatMessage[]) => ChatMessage[]) {
  ensureHydrated();
  rawMessages = updater(rawMessages);
  recomputeVisible();
  persistMessages(rawMessages);
  listeners.forEach((l) => l());
}

export function pushChatMessage(message: DistributiveOmit<ChatMessage, "sessionId">) {
  ensureHydrated();
  const stamped = { ...message, sessionId: currentSessionId } as ChatMessage;
  mutate((prev) => [...prev, stamped]);
  void mirrorAppend(stamped);
}

export function replaceChatMessage(id: string, message: DistributiveOmit<ChatMessage, "sessionId">) {
  ensureHydrated();
  const existing = rawMessages.find((m) => m.id === id);
  const stamped = { ...message, sessionId: existing?.sessionId ?? currentSessionId } as ChatMessage;
  mutate((prev) => prev.map((m) => (m.id === id ? stamped : m)));
  void mirrorUpdate(id, stamped);
}

export function removeChatMessage(id: string) {
  mutate((prev) => prev.filter((m) => m.id !== id));
  void mirrorRemove(id);
}

/** Starts a completely separate conversation — like "New chat" in most AI apps. The
 * previous conversation isn't deleted, just no longer shown; it stays in local history
 * and Google Sheets in case it's ever needed again. */
export function startNewChat() {
  ensureHydrated();
  currentSessionId = genSessionId();
  persistSessionId(currentSessionId);
  recomputeVisible();
  listeners.forEach((l) => l());
}
