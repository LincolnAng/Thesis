"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RotateCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessage, ClarifyOption } from "@/lib/home/chat-types";
import type { EntryDraft } from "@/lib/home/describe-entry";
import { EntryCard } from "@/components/home/entry-card";
import { ClarifyCard } from "@/components/home/clarify-card";
import { QuickEditForm } from "@/components/home/quick-edit-form";
import { ReviewCard } from "@/components/home/review-card";
import { AdviceCard } from "@/components/home/advice-card";
import { PromptGateCard } from "@/components/home/prompt-gate-card";
import { FormOfferCard } from "@/components/home/form-offer-card";
import { InlineText, RichText } from "@/components/home/rich-text";

// A JSON-mode reply can't be streamed token by token, so there's no real progress to report —
// this just makes the wait feel shorter than one motionless bubble does. Mounted only while a
// reply is in flight, so each appearance restarts at the first stage on its own.
const TYPING_STAGES = ["Reading your message…", "Checking your numbers…", "Almost done…"];
// Looking something up takes far longer than answering from her own figures, so the wait gets
// its own wording — a silent 60 seconds reads as the app having hung.
const LOOKUP_STAGES = [
  "That's not in your records — looking it up…",
  "Searching…",
  "Reading what I found…",
  "Working out what it means for you…",
];
const TYPING_STAGE_MS = 2200;

function TypingIndicator({ lookingUp }: { lookingUp?: boolean }) {
  const stages = lookingUp ? LOOKUP_STAGES : TYPING_STAGES;
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStage((s) => Math.min(s + 1, stages.length - 1)), TYPING_STAGE_MS);
    return () => clearInterval(id);
  }, [stages.length]);

  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-2xl bg-secondary px-4 py-3">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-secondary-foreground/50 [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-secondary-foreground/50 [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-secondary-foreground/50" />
        </span>
        <span className="text-xs text-secondary-foreground/70">{stages[stage]}</span>
      </div>
    </div>
  );
}

export function ChatThread({
  messages,
  onEdit,
  onUndo,
  onPickClarify,
  onSaveQuickEdit,
  onCancelQuickEdit,
  onConfirmReview,
  onPaymentChoice,
  onEditReview,
  onPatchReview,
  onRetry,
  onGatePick,
  onGateRefine,
  onGateAskAsIs,
  onOpenForm,
  refiningGateId,
  isLookingUp,
  isTyping = false,
}: {
  messages: ChatMessage[];
  onEdit: (id: string) => void;
  onUndo: (id: string) => void;
  onPickClarify: (id: string, option: ClarifyOption) => void;
  onSaveQuickEdit: (id: string, draft: EntryDraft) => void;
  onCancelQuickEdit: (id: string) => void;
  /** Writes the proposed entry to the ledger — nothing else in this thread does. */
  onConfirmReview: (id: string) => void;
  /** Opens the full transaction form for a form-offer card. */
  onOpenForm?: (id: string) => void;
  /** Applies (or drops) a payment BAi prepared — only on her say-so. */
  onPaymentChoice: (id: string, confirmed: boolean) => void;
  onEditReview: (id: string) => void;
  /** Changes a proposed entry before it's saved (how it was paid). */
  onPatchReview?: (id: string, patch: Partial<EntryDraft>) => void;
  onRetry: (text: string) => void;
  onGatePick: (messageId: string, text: string) => void;
  onGateRefine: (messageId: string, extra: string) => void;
  onGateAskAsIs: (messageId: string) => void;
  refiningGateId: string | null;
  isLookingUp?: boolean;
  /** Shows a floating "BAi is typing" bubble while a response is in flight. */
  isTyping?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isTyping]);

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
                "max-w-[85%] space-y-2 rounded-2xl px-3.5 py-2 text-sm",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
              )}
            >
              {m.role === "assistant" ? <RichText text={m.text} /> : <p className="whitespace-pre-wrap">{m.text}</p>}
              {/* Where an online answer came from — kept visibly apart from the shop's own records. */}
              {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                <div className="border-t border-line/15 pt-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">From the web</p>
                  <ul className="mt-1 space-y-0.5">
                    {m.sources.map((src) => (
                      <li key={src.url} className="truncate text-[12.5px]">
                        <a href={src.url} target="_blank" rel="noreferrer" className="text-cacao underline decoration-dotted underline-offset-2">
                          {src.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {m.role === "assistant" && m.retryText && (
                <Button size="sm" variant="secondary" className="h-7 gap-1" onClick={() => onRetry(m.retryText!)}>
                  <RotateCw className="h-3.5 w-3.5" />
                  Try again
                </Button>
              )}
            </div>
          )}

          {m.kind === "payment" && (
            <div className="max-w-[85%] space-y-2.5 rounded-2xl border border-line/15 bg-card px-4 py-3 text-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Payment to record</p>
              <p className="text-[14px]">{m.summary}</p>
              {m.resolved ? (
                <p className={`text-[13px] font-semibold ${m.resolved === "confirmed" ? "text-success" : "text-muted-foreground"}`}>
                  {m.resolved === "confirmed" ? "Recorded." : "Not recorded."}
                </p>
              ) : (
                <div className="flex gap-2">
                  <Button className="min-h-11" onClick={() => onPaymentChoice(m.id, true)}>
                    Confirm
                  </Button>
                  <Button className="min-h-11" variant="secondary" onClick={() => onPaymentChoice(m.id, false)}>
                    Don&apos;t record
                  </Button>
                </div>
              )}
            </div>
          )}

          {m.kind === "entry" && <EntryCard draft={m.draft} onEdit={() => onEdit(m.id)} onUndo={() => onUndo(m.id)} />}

          {m.kind === "review" && (
            <ReviewCard
              draft={m.draft}
              stated={m.stated}
              onConfirm={() => onConfirmReview(m.id)}
              onEdit={() => onEditReview(m.id)}
              onPatch={onPatchReview ? (patch) => onPatchReview(m.id, patch) : undefined}
            />
          )}

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

          {m.kind === "advice" && <AdviceCard advice={m.advice} />}

          {m.kind === "form-offer" && <FormOfferCard missing={m.missing} hasDraft={Boolean(m.draft)} onOpen={() => onOpenForm?.(m.id)} />}

          {m.kind === "prompt-gate" && (
            <PromptGateCard
              rawText={m.rawText}
              suggestions={m.suggestions}
              reasons={m.reasons}
              resolved={m.resolved}
              refining={refiningGateId === m.id}
              onPick={(text) => onGatePick(m.id, text)}
              onRefine={(extra) => onGateRefine(m.id, extra)}
              onAskAsIs={() => onGateAskAsIs(m.id)}
            />
          )}

          {m.kind === "insight" && (
            <div className="max-w-[85%] space-y-1.5 rounded-2xl bg-secondary px-3.5 py-2.5 text-sm text-secondary-foreground">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p><InlineText text={m.text} /></p>
              </div>
              <Link href="/" className="pl-6 text-xs font-medium text-primary underline">
                See summary
              </Link>
            </div>
          )}
        </div>
        );
      })}
      {isTyping && <TypingIndicator key={isLookingUp ? "lookup" : "normal"} lookingUp={isLookingUp} />}
      <div ref={bottomRef} />
    </div>
  );
}
