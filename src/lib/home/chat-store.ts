import type { ChatMessage } from "./chat-types";

const STORAGE_KEY = "mang-kikos-cocoa-chat-v1";

export const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  kind: "text",
  text: 'Hi! Tell me about a sale or a purchase, like "sold 12 jars to Aling Nena, wholesale, 2160". You can also ask things like "how much did I make this week?"',
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
const listeners = new Set<() => void>();

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  state = loadMessages();
  hydrated = true;
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
}

export function replaceChatMessage(id: string, message: ChatMessage) {
  setState((prev) => prev.map((m) => (m.id === id ? message : m)));
}

export function removeChatMessage(id: string) {
  setState((prev) => prev.filter((m) => m.id !== id));
}
