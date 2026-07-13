"use client";

import { useSyncExternalStore } from "react";
import { subscribe, getReadySnapshot, getReadyServerSnapshot } from "./chat-store";

/** True once the initial load from Google Sheets (the only copy of chat history) has
 * settled. Used to hold off sending until we know which conversation a message belongs to. */
export function useChatReady(): boolean {
  return useSyncExternalStore(subscribe, getReadySnapshot, getReadyServerSnapshot);
}
