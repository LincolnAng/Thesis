"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { ChatThread } from "@/components/home/chat-thread";
import { ChatComposer } from "@/components/home/chat-composer";
import { ChatLanding } from "@/components/home/chat-landing";
import { PastChatsButton } from "@/components/home/chat-sidebar";
import type { ClarifyOption } from "@/lib/home/chat-types";
import type { EntryDraft } from "@/lib/home/describe-entry";
import { useAiStatus } from "@/lib/ai/use-ai-status";
import { useStore } from "@/lib/store/use-store";
import { requestAssistant } from "@/lib/ai/assistant-client";
import { requestAdvice, requestSharpen, requestTriage } from "@/lib/ai/advisor-client";
import { buildAdvisorContext } from "@/lib/ai/advisor-context";
import { classifyIntent } from "@/lib/ai/intent";
import { assessSharpness } from "@/lib/ai/prompt-gate";
import { localAnswer } from "@/lib/ai/local-fallback";
import { buildDataSummary } from "@/lib/ai/data-summary";
import { allExpenseCategories } from "@/lib/summary/expenses-summary";
import { addEntry, deleteEntry, replaceEntry } from "@/lib/store/store";
import { buildClarifyPrompt } from "@/lib/home/clarify";
import { computeInsight } from "@/lib/home/insights";
import { pushChatMessage, removeChatMessage, replaceChatMessage, startNewChat } from "@/lib/home/chat-store";
import { useChatMessages } from "@/lib/home/use-chat-messages";
import { useChatReady } from "@/lib/home/use-chat-ready";

const CONFIDENCE_THRESHOLD = 0.7;
const INSIGHT_EVERY = 3;

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

/**
 * The assistant, living on Home. Empty: a greeting, one message box and prompts to tap.
 * Once something is sent, the conversation continues right here. Nothing reaches the
 * ledger until the owner confirms the review card.
 */
export function HomeChat() {
  const messages = useChatMessages();
  const ready = useChatReady();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  /** Which gate card is waiting on fresh suggestions, so only that one shows a spinner. */
  const [refiningGateId, setRefiningGateId] = useState<string | null>(null);
  /** True while a question is being handed to the advisor to look up, so the wait is explained. */
  const [lookingUp, setLookingUp] = useState(false);
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

  /** Proposes an entry without recording it. The ledger is only touched by handleConfirmReview. */
  function proposeDraft(draft: EntryDraft, stated: string[], rawText: string) {
    push({ id: genId(), role: "assistant", kind: "review", rawText, draft, stated, createdAt: nowIso() });
  }

  function handleRetry(text: string) {
    setInput(text);
    void handleSubmit(text);
  }

  function handleConfirmReview(id: string) {
    const message = messages.find((m) => m.id === id);
    if (!message || message.kind !== "review") return;
    const entry = addEntry(message.draft);
    replace(id, {
      id,
      role: "assistant",
      kind: "entry",
      entryId: entry.id,
      draft: message.draft,
      createdAt: message.createdAt,
    });
    maybeAppendInsight();
  }

  function handleEditReview(id: string) {
    const message = messages.find((m) => m.id === id);
    if (!message || message.kind !== "review") return;
    replace(id, {
      id,
      role: "assistant",
      kind: "quick-edit",
      entryId: null,
      draft: message.draft,
      createdAt: message.createdAt,
    });
  }

  async function askAdvisor(question: string) {
    setSubmitting(true);
    setLookingUp(true);
    const outcome = await requestAdvice(question, buildAdvisorContext(state));
    setSubmitting(false);
    setLookingUp(false);

    if (outcome.status === "ok") {
      push({
        id: genId(),
        role: "assistant",
        kind: "advice",
        question,
        advice: outcome.advice,
        topic: outcome.topic,
        createdAt: nowIso(),
      });
      return;
    }

    // Same rule as the assistant: when the AI never ran, say so. An answer assembled locally
    // would sound just as confident and be worth nothing.
    const text =
      outcome.status === "unavailable"
        ? "I can't reach the AI right now, so I won't guess at business advice. Check the API key under Settings → AI assistant."
        : outcome.status === "unreachable"
          ? "I couldn't reach the AI just now, so I won't guess at an answer. Check the API key under Settings → AI assistant."
          : "The AI replied with something I couldn't read. Try asking again, or reword it.";
    push({ id: genId(), role: "assistant", kind: "text", text, retryText: question, createdAt: nowIso() });
  }

  /** The owner picked one of the sharper questions, or chose to send her own words anyway. */
  async function handleGateChoice(messageId: string, chosen: string) {
    const message = messages.find((m) => m.id === messageId);
    if (message && message.kind === "prompt-gate") {
      replace(messageId, { ...message, resolved: true });
    }
    push({ id: genId(), role: "user", kind: "text", text: chosen, createdAt: nowIso() });
    await askAdvisor(chosen);
  }

  /**
   * "Others" — she added her own words.
   *
   * This is the way through the gate, so it has to actually lead somewhere. If what she has
   * written is now specific enough to answer, it goes to the advisor UNREWRITTEN: the gate
   * exists to stop vague questions, not to make her ask in the app's words.
   */
  async function handleGateRefine(messageId: string, extra: string) {
    const message = messages.find((m) => m.id === messageId);
    if (!message || message.kind !== "prompt-gate") return;

    const combined = `${message.rawText} — ${extra}`;
    if (assessSharpness(combined).sharp) {
      replace(messageId, { ...message, resolved: true });
      push({ id: genId(), role: "user", kind: "text", text: combined, createdAt: nowIso() });
      await askAdvisor(combined);
      return;
    }

    setRefiningGateId(messageId);
    const outcome = await requestSharpen(message.rawText, buildAdvisorContext(state), extra);
    setRefiningGateId(null);
    if (outcome.status === "ok") {
      replace(messageId, { ...message, suggestions: outcome.suggestions });
      return;
    }
    // Sharpening failed — the assistant is unreachable, which is not her fault and not a reason
    // to leave her with no way forward. Answer what she gave rather than blocking on a 500.
    replace(messageId, { ...message, resolved: true });
    push({ id: genId(), role: "user", kind: "text", text: combined, createdAt: nowIso() });
    await askAdvisor(combined);
  }

  async function handleSubmit(override?: string, opts: { freshChat?: boolean; skipGate?: boolean } = {}) {
    if (!ready) return; // still loading history from Sheets — don't guess which chat this belongs to
    const rawText = (override ?? input).trim();
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

    // Which helper should answer. The word rules settle the obvious cases for free; when they
    // admit they are guessing, the small model decides instead of a keyword list that has
    // never seen this phrasing.
    const guess = classifyIntent(rawText);
    let intent = guess.intent;
    if (!guess.confident) {
      setSubmitting(true);
      const triaged = await requestTriage(rawText, state.products.map((p) => p.name));
      setSubmitting(false);
      if (triaged) intent = triaged;
    }

    // Advice questions take a different road: a bigger briefing, a longer answer, and a gate in
    // front of the vague ones. Transaction logs never come down here.
    if (!opts.skipGate && intent === "advice") {
      const sharpness = assessSharpness(rawText);
      if (!sharpness.sharp) {
        setSubmitting(true);
        const suggestions = await requestSharpen(rawText, buildAdvisorContext(state));
        setSubmitting(false);
        if (suggestions.status === "ok") {
          push({
            id: genId(),
            role: "assistant",
            kind: "prompt-gate",
            rawText,
            suggestions: suggestions.suggestions,
            reasons: sharpness.reasons,
            createdAt: nowIso(),
          });
          return;
        }
        // Couldn't reach the sharpener. The gate blocks vague questions, but it must not block
        // on an outage she didn't cause and can't fix — so this one goes through.
      }
      await askAdvisor(rawText);
      return;
    }

    setSubmitting(true);
    const summary = buildDataSummary(state);
    // Only plain text turns carry usable conversation context; entry cards, clarify prompts
    // and quick-edit forms aren't turns. `messages` is this render's snapshot, so it excludes
    // the owner message pushed above — which is correct, that one is sent as `rawText`.
    const history = (opts.freshChat ? [] : messages)
      .filter((m) => m.kind === "text")
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.text }));
    const outcome = await requestAssistant(rawText, summary, history, allExpenseCategories(state.categoryBudgets));
    setSubmitting(false);

    if (outcome.status === "unavailable") {
      push({
        id: genId(),
        role: "assistant",
        kind: "text",
        text: "I can't reach the assistant right now — that's a connection problem, not something you did. Try again, or fill this in and it'll still be recorded.",
        retryText: rawText,
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

    if (outcome.status === "unreachable") {
      // Deliberately not answered from the offline keyword matcher: a confident-sounding
      // answer when the assistant never ran is the thing that reads as the app making
      // things up.
      push({
        id: genId(),
        role: "assistant",
        kind: "text",
        text: "I couldn't reach the AI just now, so I won't guess at an answer. Check the API key under Settings → AI assistant. You can still record this yourself below.",
        retryText: rawText,
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
        text: "I couldn't read that into an entry — the assistant replied with something I couldn't parse. Try again, reword it, or fill this in yourself.",
        retryText: rawText,
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
      // It couldn't answer from her own records. Rather than showing an apology and making her
      // ask again, hand straight over to the advisor, which can search. She never sees the seam.
      if (outcome.needsLookup) {
        setLookingUp(true);
        await askAdvisor(rawText);
        setLookingUp(false);
        return;
      }
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

    proposeDraft(draft, outcome.stated, rawText);
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
    // Answering the clarifying question still doesn't record anything — it fills the gap and
    // comes back for confirmation, so the review card stays the only path to the ledger.
    const finalDraft: EntryDraft = { ...message.draft, ...option.patch, confidence: 1 };
    replace(id, {
      id,
      role: "assistant",
      kind: "review",
      rawText: message.rawText,
      draft: finalDraft,
      stated: Object.keys(option.patch ?? {}),
      createdAt: message.createdAt,
    });
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

  const isEmpty = !messages.some((m) => m.kind !== "divider" && "role" in m && m.role === "user");

  function handleCancelQuickEdit(id: string) {
    removeChatMessage(id);
  }

  // Home opens on a fresh conversation, like Claude's start page. Earlier chats stay under
  // "Past chats"; a new session isn't written to Sheets until its first message.
  const openedFresh = useRef(false);
  useEffect(() => {
    if (!ready || openedFresh.current) return;
    openedFresh.current = true;
    startNewChat();
  }, [ready]);

  const toolbar = (
    <div className="flex justify-end gap-1">
      <PastChatsButton />
      {!isEmpty && (
        <button
          type="button"
          onClick={() => startNewChat()}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> New chat
        </button>
      )}
    </div>
  );

  // Until history has loaded (and Home has switched to a fresh chat), show the start screen
  // rather than flashing whichever old conversation the browser had cached.
  if (isEmpty || !ready || !openedFresh.current) {
    return (
      <div className="mx-auto w-full max-w-[760px]">
        {toolbar}
        <div className="pt-[6vh]">
          <ChatLanding onSubmit={(text) => void handleSubmit(text)} disabled={!ready || submitting} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
      {toolbar}
      <ChatThread
        messages={messages}
        onEdit={handleEdit}
        onUndo={handleUndo}
        onPickClarify={handlePickClarify}
        onSaveQuickEdit={handleSaveQuickEdit}
        onCancelQuickEdit={handleCancelQuickEdit}
        onConfirmReview={handleConfirmReview}
        onEditReview={handleEditReview}
        onRetry={handleRetry}
        onGatePick={(id, text) => void handleGateChoice(id, text)}
        onGateRefine={(id, extra) => void handleGateRefine(id, extra)}
        refiningGateId={refiningGateId}
        isTyping={submitting}
        isLookingUp={lookingUp}
      />
      <ChatComposer
        value={input}
        onChange={setInput}
        onSubmit={() => void handleSubmit()}
        disabled={submitting || !ready}
        placeholder="Reply, or tell me what else happened…"
        className="mx-auto w-full max-w-[720px]"
      />
    </div>
  );
}
