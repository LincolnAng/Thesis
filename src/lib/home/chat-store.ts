import type { ChatMessage } from "./chat-types";

const STORAGE_KEY = "mang-kikos-cocoa-chat-v1";

export const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  kind: "text",
  text: 'Hi! Tell me about a sale or a purchase, like "sold 12 jars to Aling Nena, wholesale, 2160". You can also ask things like "how much did I make this week?"',
  // Fixed, not "now" — this is evaluated at module load on both server and client,
  // and must match exactly to avoid a hydration mismatch.
  createdAt: "2026-01-01T00:00:00.000Z",
};

function loadMessages(): ChatMessage[] {
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

function persist(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // storage full or unavailable - fail silently, chat still works in-memory
  }
}

// The server (and the client's very first render, before hydration) always see
// this fixed snapshot. Only after mount does the client swap in whatever was
// actually saved, via useSyncExternalStore's dual-snapshot support — this is
// what keeps chat history from causing a hydration mismatch.
const serverSnapshot: ChatMessage[] = [GREETING];
let state: ChatMessage[] = serverSnapshot;
let hydrated = false;
let serverSyncStarted = false;
const listeners = new Set<() => void>();

/**
 * Merges in whatever's saved in Google Sheets (the durable, cross-device copy) without
 * discarding anything local — local wins on id conflicts, so an in-flight message that
 * hasn't finished mirroring yet is never wiped out by a stale server read.
 */
async function syncFromServer() {
  try {
    const res = await fetch("/api/chat-history");
    const json = await res.json();
    if (!json.success || !Array.isArray(json.messages) || json.messages.length === 0) return;
    const serverMessages = json.messages as ChatMessage[];
    setState((prev) => {
      const byId = new Map(serverMessages.map((m) => [m.id, m]));
      for (const m of prev) byId.set(m.id, m);
      return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
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
    state = loadMessages();
    hydrated = true;
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
  return state;
}

export function getServerSnapshot(): ChatMessage[] {
  return serverSnapshot;
}

function setState(updater: (prev: ChatMessage[]) => ChatMessage[]) {
  ensureHydrated();
  state = updater(state);
  persist(state);
  listeners.forEach((l) => l());
}

export function pushChatMessage(message: ChatMessage) {
  setState((prev) => [...prev, message]);
  void mirrorAppend(message);
}

export function replaceChatMessage(id: string, message: ChatMessage) {
  setState((prev) => prev.map((m) => (m.id === id ? message : m)));
  void mirrorUpdate(id, message);
}

export function removeChatMessage(id: string) {
  setState((prev) => prev.filter((m) => m.id !== id));
  void mirrorRemove(id);
}

export function startNewChat() {
  const message: ChatMessage = { id: `divider-${Date.now()}`, kind: "divider", createdAt: new Date().toISOString() };
  setState((prev) => [...prev, message]);
  void mirrorAppend(message);
}
