"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage, ClarifyOption } from "@/lib/home/chat-types";
import type { EntryDraft } from "@/lib/home/describe-entry";
import { EntryCard } from "@/components/home/entry-card";
import { ClarifyCard } from "@/components/home/clarify-card";
import { QuickEditForm } from "@/components/home/quick-edit-form";

export function ChatThread({
  messages,
  onEdit,
  onUndo,
  onPickClarify,
  onSaveQuickEdit,
  onCancelQuickEdit,
}: {
  messages: ChatMessage[];
  onEdit: (id: string) => void;
  onUndo: (id: string) => void;
  onPickClarify: (id: string, option: ClarifyOption) => void;
  onSaveQuickEdit: (id: string, draft: EntryDraft) => void;
  onCancelQuickEdit: (id: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-4 py-4">
      {messages.map((m) => {
        if (m.kind === "divider") {
          return (
            <div key={m.id} className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">{m.label}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          );
        }
        if (m.kind === "session-title") return null; // metadata only — never rendered in the thread
        return (
        <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
          {m.kind === "text" && (
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
              )}
            >
              {m.text}
            </div>
          )}

          {m.kind === "entry" && <EntryCard draft={m.draft} onEdit={() => onEdit(m.id)} onUndo={() => onUndo(m.id)} />}

          {m.kind === "entry-undone" && (
            <div className="max-w-[85%] rounded-2xl bg-secondary px-3.5 py-2 text-sm text-muted-foreground">
              Undone. That entry has been removed.
            </div>
          )}

          {m.kind === "clarify" && (
            <ClarifyCard question={m.question} options={m.options} onPick={(option) => onPickClarify(m.id, option)} />
          )}

          {m.kind === "quick-edit" && (
            <QuickEditForm
              initial={m.draft}
              onSave={(draft) => onSaveQuickEdit(m.id, draft)}
              onCancel={() => onCancelQuickEdit(m.id)}
            />
          )}

          {m.kind === "insight" && (
            <div className="max-w-[85%] space-y-1.5 rounded-2xl bg-secondary px-3.5 py-2.5 text-sm text-secondary-foreground">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>{m.text}</p>
              </div>
              <Link href="/" className="pl-6 text-xs font-medium text-primary underline">
                See summary
              </Link>
            </div>
          )}
        </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
