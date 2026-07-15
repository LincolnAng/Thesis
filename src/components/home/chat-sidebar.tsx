"use client";

import { useState } from "react";
import { Check, MessageSquarePlus, MessageSquareText, PanelLeft, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteSession, renameSession, startNewChat, switchToSession } from "@/lib/home/chat-store";
import { useChatSessions } from "@/lib/home/use-chat-sessions";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";

function ChatSidebarList({ onNavigate }: { onNavigate?: () => void }) {
  const { sessions, currentSessionId } = useChatSessions();
  const ordered = [...sessions].reverse(); // most recent conversation first
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  function startEditing(id: string, currentLabel: string) {
    setEditingId(id);
    setEditText(currentLabel);
  }

  function commitEdit() {
    if (editingId) renameSession(editingId, editText);
    setEditingId(null);
  }

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
        {ordered.map((session) =>
          editingId === session.id ? (
            <div key={session.id} className="flex items-center gap-1 px-1 py-0.5">
              <input
                autoFocus
                aria-label="Chat name"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <button
                type="button"
                onClick={commitEdit}
                aria-label="Save name"
                className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                aria-label="Cancel rename"
                className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div key={session.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  switchToSession(session.id);
                  onNavigate?.();
                }}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm",
                  session.id === currentSessionId
                    ? "bg-secondary font-medium text-secondary-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                <MessageSquareText className="h-4 w-4 shrink-0" />
                <span className="truncate">{session.label}</span>
              </button>
              <button
                type="button"
                onClick={() => startEditing(session.id, session.label)}
                aria-label={`Rename ${session.label}`}
                className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <ConfirmDeleteButton label={`Delete ${session.label}`} onConfirm={() => deleteSession(session.id)} />
            </div>
          ),
        )}
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
