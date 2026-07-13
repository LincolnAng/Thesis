"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { ChatThread } from "@/components/home/chat-thread";
import { ChatInputBar } from "@/components/home/chat-input-bar";
import { Button } from "@/components/ui/button";
import type { ClarifyOption } from "@/lib/home/chat-types";
import type { EntryDraft } from "@/lib/home/describe-entry";
import { useAiStatus } from "@/lib/ai/use-ai-status";
import { useStore } from "@/lib/store/use-store";
import { requestAssistant } from "@/lib/ai/assistant-client";
import { localAnswer } from "@/lib/ai/local-fallback";
import { buildDataSummary } from "@/lib/ai/data-summary";
import { addEntry, deleteEntry, replaceEntry } from "@/lib/store/store";
import { buildClarifyPrompt } from "@/lib/home/clarify";
import { computeInsight } from "@/lib/home/insights";
import { pushChatMessage, removeChatMessage, replaceChatMessage, startNewChat } from "@/lib/home/chat-store";
import { useChatMessages } from "@/lib/home/use-chat-messages";

const CONFIDENCE_THRESHOLD = 0.7;
const INSIGHT_EVERY = 3;

const QUICK_START_EXAMPLES = [
  "Sold 10 jars to Aling Nena, 1800",
  "Bought 5kg cocoa beans, 450",
  "Made a batch of Classic Cocoa Spread",
  "How much did I make this week?",
];

function genId(): string {
  return `msg-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function blankDraft(rawText: string): EntryDraft {
  return {
    timestamp: new Date().toISOString(),
    type: "NOTE",
    amount: null,
    quantity: null,
    unit: null,
    sku: null,
    counterparty: null,
    location: null,
    priceType: null,
    category: null,
    rawText,
    confidence: 0,
    notes: null,
  };
}

function HomePageInner() {
  const searchParams = useSearchParams();
  const messages = useChatMessages();
  const [input, setInput] = useState(() => searchParams.get("draft") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const { degraded } = useAiStatus();
  const state = useStore();
  const saveCount = useRef(0);

  const push = pushChatMessage;
  const replace = replaceChatMessage;

  function maybeAppendInsight() {
    saveCount.current += 1;
    if (saveCount.current % INSIGHT_EVERY !== 0) return;
    const text = computeInsight(state);
    if (!text) return;
    push({ id: genId(), role: "assistant", kind: "insight", text, createdAt: nowIso() });
  }

  function saveDraft(draft: EntryDraft) {
    const entry = addEntry(draft);
    push({ id: genId(), role: "assistant", kind: "entry", entryId: entry.id, draft, createdAt: nowIso() });
    maybeAppendInsight();
  }

  async function handleSubmit() {
    const rawText = input.trim();
    if (!rawText) return;
    setInput("");
    push({ id: genId(), role: "user", kind: "text", text: rawText, createdAt: nowIso() });

    if (degraded) {
      push({
        id: genId(),
        role: "assistant",
        kind: "quick-edit",
        entryId: null,
        draft: blankDraft(rawText),
        createdAt: nowIso(),
      });
      return;
    }

    setSubmitting(true);
    const summary = buildDataSummary(state);
    const outcome = await requestAssistant(rawText, summary, []);
    setSubmitting(false);

    if (outcome.status === "unavailable") {
      push({
        id: genId(),
        role: "assistant",
        kind: "text",
        text: "The AI assistant isn't available right now, so here's a quick form to fill in instead.",
        createdAt: nowIso(),
      });
      push({
        id: genId(),
        role: "assistant",
        kind: "quick-edit",
        entryId: null,
        draft: blankDraft(rawText),
        createdAt: nowIso(),
      });
      return;
    }

    if (outcome.status === "failed") {
      push({
        id: genId(),
        role: "assistant",
        kind: "text",
        text: "Something went wrong reading that — here's a quick form to fill in instead.",
        createdAt: nowIso(),
      });
      push({
        id: genId(),
        role: "assistant",
        kind: "quick-edit",
        entryId: null,
        draft: blankDraft(rawText),
        createdAt: nowIso(),
      });
      return;
    }

    if (outcome.status === "chat") {
      const fallback = outcome.reply.trim() || localAnswer(rawText, state);
      push({ id: genId(), role: "assistant", kind: "text", text: fallback, createdAt: nowIso() });
      return;
    }

    // outcome.status === "entry"
    const draft: EntryDraft = {
      timestamp: new Date(outcome.entry.date).toISOString(),
      type: outcome.entry.type,
      amount: outcome.entry.amount,
      quantity: outcome.entry.quantity,
      unit: outcome.entry.unit,
      sku: outcome.entry.sku,
      counterparty: outcome.entry.counterparty,
      location: outcome.entry.location,
      priceType: outcome.entry.priceType,
      category: outcome.entry.category,
      rawText,
      confidence: outcome.entry.confidence,
      notes: outcome.entry.notes,
    };

    if (outcome.clarifyQuestion && outcome.clarifyOptions && outcome.clarifyOptions.length > 0) {
      const options: ClarifyOption[] = [
        ...outcome.clarifyOptions.map((o) => ({ label: o.label, patch: o.patch })),
        { label: "Something else", openEdit: true },
      ];
      push({
        id: genId(),
        role: "assistant",
        kind: "clarify",
        rawText,
        question: outcome.clarifyQuestion,
        draft,
        options,
        createdAt: nowIso(),
      });
      return;
    }

    if (draft.confidence < CONFIDENCE_THRESHOLD) {
      // Defensive fallback: the model flagged low confidence but didn't supply its own
      // clarifyQuestion — fall back to a generic confirmation rather than silently saving.
      const { question, options } = buildClarifyPrompt(draft);
      push({ id: genId(), role: "assistant", kind: "clarify", rawText, question, draft, options, createdAt: nowIso() });
      return;
    }

    saveDraft(draft);
  }

  function handleEdit(id: string) {
    const message = messages.find((m) => m.id === id);
    if (!message || message.kind !== "entry") return;
    replace(id, {
      id,
      role: "assistant",
      kind: "quick-edit",
      entryId: message.entryId,
      draft: message.draft,
      createdAt: message.createdAt,
    });
  }

  function handleUndo(id: string) {
    const message = messages.find((m) => m.id === id);
    if (!message || message.kind !== "entry") return;
    deleteEntry(message.entryId);
    replace(id, { id, role: "assistant", kind: "entry-undone", draft: message.draft, createdAt: message.createdAt });
  }

  function handlePickClarify(id: string, option: ClarifyOption) {
    const message = messages.find((m) => m.id === id);
    if (!message || message.kind !== "clarify") return;
    if (option.openEdit) {
      replace(id, {
        id,
        role: "assistant",
        kind: "quick-edit",
        entryId: null,
        draft: message.draft,
        createdAt: message.createdAt,
      });
      return;
    }
    const finalDraft: EntryDraft = { ...message.draft, ...option.patch, confidence: 1 };
    const entry = addEntry(finalDraft);
    replace(id, {
      id,
      role: "assistant",
      kind: "entry",
      entryId: entry.id,
      draft: finalDraft,
      createdAt: message.createdAt,
    });
    maybeAppendInsight();
  }

  function handleSaveQuickEdit(id: string, draft: EntryDraft) {
    const message = messages.find((m) => m.id === id);
    if (!message || message.kind !== "quick-edit") return;
    if (message.entryId) {
      replaceEntry(message.entryId, draft);
      replace(id, { id, role: "assistant", kind: "entry", entryId: message.entryId, draft, createdAt: message.createdAt });
    } else {
      const entry = addEntry(draft);
      replace(id, { id, role: "assistant", kind: "entry", entryId: entry.id, draft, createdAt: message.createdAt });
      maybeAppendInsight();
    }
  }

  function handleCancelQuickEdit(id: string) {
    removeChatMessage(id);
  }

  return (
    <div className="flex min-h-[calc(100svh-4rem)] flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">Tell me what happened — I&apos;ll track it.</p>
          <Button size="sm" variant="ghost" className="shrink-0 gap-1.5 text-xs text-muted-foreground" onClick={startNewChat}>
            <MessageSquarePlus className="h-3.5 w-3.5" /> New chat
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ChatThread
          messages={messages}
          onEdit={handleEdit}
          onUndo={handleUndo}
          onPickClarify={handlePickClarify}
          onSaveQuickEdit={handleSaveQuickEdit}
          onCancelQuickEdit={handleCancelQuickEdit}
        />
      </div>
      {messages.length <= 1 && (
        <div className="mx-auto w-full max-w-[720px] px-4 pb-2">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Try one of these:</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_START_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setInput(example)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-accent"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
      <ChatInputBar value={input} onChange={setInput} onSubmit={handleSubmit} submitting={submitting} />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}
