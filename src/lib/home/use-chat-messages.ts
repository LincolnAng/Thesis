"use client";

import { useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, subscribe } from "./chat-store";
import type { ChatMessage } from "./chat-types";

export function useChatMessages(): ChatMessage[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
