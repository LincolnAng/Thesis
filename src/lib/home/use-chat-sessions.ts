"use client";

import { useSyncExternalStore } from "react";
import {
  subscribe,
  getSessionsSnapshot,
  getSessionsServerSnapshot,
  getCurrentSessionIdSnapshot,
  getCurrentSessionIdServerSnapshot,
  type ChatSession,
} from "./chat-store";

export function useChatSessions(): { sessions: ChatSession[]; currentSessionId: string } {
  const sessions = useSyncExternalStore(subscribe, getSessionsSnapshot, getSessionsServerSnapshot);
  const currentSessionId = useSyncExternalStore(subscribe, getCurrentSessionIdSnapshot, getCurrentSessionIdServerSnapshot);
  return { sessions, currentSessionId };
}
