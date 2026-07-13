"use client";

import { useState } from "react";
import { MessageSquarePlus, MessageSquareText, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { startNewChat, switchToSession } from "@/lib/home/chat-store";
import { useChatSessions } from "@/lib/home/use-chat-sessions";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

function ChatSidebarList({ onNavigate }: { onNavigate?: () => void }) {
  const { sessions, currentSessionId } = useChatSessions();
  const ordered = [...sessions].reverse(); // most recent conversation first

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          type="button"
          onClick={() => {
            startNewChat();
            onNavigate?.();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <MessageSquarePlus className="h-4 w-4" /> New chat
        </button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {ordered.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => {
              switchToSession(session.id);
              onNavigate?.();
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm",
              session.id === currentSessionId
                ? "bg-secondary font-medium text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            <MessageSquareText className="h-4 w-4 shrink-0" />
            <span className="truncate">{session.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Always-visible conversation list for wide screens. */
export function ChatSidebarDesktop() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border min-[900px]:block">
      <ChatSidebarList />
    </aside>
  );
}

/** A menu button that opens the conversation list as a slide-in panel, for narrow screens. */
export function ChatSidebarMobileTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          <PanelLeft className="h-4 w-4" /> Chats
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">Conversations</SheetTitle>
        <ChatSidebarList onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
