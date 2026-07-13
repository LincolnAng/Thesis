"use client";

import { MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { startNewChat, switchToSession } from "@/lib/home/chat-store";
import { useChatSessions } from "@/lib/home/use-chat-sessions";

export function ChatTabs() {
  const { sessions, currentSessionId } = useChatSessions();

  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {sessions.map((session) => (
        <button
          key={session.id}
          type="button"
          onClick={() => switchToSession(session.id)}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            session.id === currentSessionId
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-accent",
          )}
        >
          {session.label}
        </button>
      ))}
      <button
        type="button"
        onClick={startNewChat}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" /> New chat
      </button>
    </div>
  );
}
