"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { ChatThread } from "@/components/home/chat-thread";
import { ChatComposer } from "@/components/home/chat-composer";
import { ChatLanding } from "@/components/home/chat-landing";
import { TransactionDialog } from "@/components/transactions/transaction-dialog";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { PastChatsButton } from "@/components/home/chat-sidebar";
import type { ClarifyOption } from "@/lib/home/chat-types";
import type { EntryDraft } from "@/lib/home/describe-entry";
import { useAiStatus } from "@/lib/ai/use-ai-status";
import { useStore } from "@/lib/store/use-store";
import { requestAgent } from "@/lib/ai/agent-client";
import { requestAdvice, requestSharpen } from "@/lib/ai/advisor-client";
import { buildAdvisorContext } from "@/lib/ai/advisor-context";
import { assessSharpness } from "@/lib/ai/prompt-gate";
import { addEntry, deleteEntry, replaceEntry } from "@/lib/store/store";
import { computeInsight } from "@/lib/home/insights";
import { pushChatMessage, removeChatMessage, replaceChatMessage, startNewChat } from "@/lib/home/chat-store";
import { useChatMessages } from "@/lib/home/use-chat-messages";
import { useChatReady } from "@/lib/home/use-chat-ready";

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
  const currentUser = useCurrentUser();
  const saveCount = useRef(0);
  /** Multi-product orders, investments and payment details are edited in the full transaction
   *  form, which understands them; the small inline form is for single-line entries. */
  const [fullEdit, setFullEdit] = useState<{ messageId: string; entryId: string | null; draft: EntryDraft } | null>(null);
  const needsFullForm = (d: EntryDraft) =>
    Boolean(d.lineItems?.length) || d.type === "CAPITAL" || d.type === "ASSET" || Boolean(d.payments?.length) || Boolean(d.paymentMethod);

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
    if (needsFullForm(message.draft)) {
      setFullEdit({ messageId: id, entryId: null, draft: message.draft });
      return;
    }
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

  /** "Ask as I wrote it" — her question goes to the advisor unchanged. It is already in the
   *  thread as her message, so only the answer is added. */
  async function handleGateAskAsIs(messageId: string) {
    const message = messages.find((m) => m.id === messageId);
    if (!message || message.kind !== "prompt-gate") return;
    replace(messageId, { ...message, resolved: true });
    await askAdvisor(message.rawText);
  }

  async function handleSubmit(
    override?: string,
    opts: { freshChat?: boolean; skipGate?: boolean } = {},
  ) {
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

    // One assistant for everything: BAi decides whether this is a question about the shop, a
    // general question, something to look up online, or something to record — and reads the
    // shop's records itself, on the server, as this profile is allowed to see them.
    setSubmitting(true);
    const history = (opts.freshChat ? [] : messages)
      .filter((m) => m.kind === "text")
      .slice(-10)
      .map((m) => ({ role: m.role, text: m.text }));
    const outcome = await requestAgent([...history, { role: "user", text: rawText }]);
    setSubmitting(false);

    if (outcome.status !== "ok") {
      push({ id: genId(), role: "assistant", kind: "text", text: outcome.message, retryText: rawText, createdAt: nowIso() });
      // Recording still works without the assistant: offer the form to fill in by hand.
      if (outcome.status !== "signed_out") {
        push({ id: genId(), role: "assistant", kind: "quick-edit", entryId: null, draft: blankDraft(rawText), createdAt: nowIso() });
      }
      return;
    }

    if (outcome.reply) {
      push({
        id: genId(),
        role: "assistant",
        kind: "text",
        text: outcome.reply,
        ...(outcome.sources.length ? { sources: outcome.sources } : {}),
        createdAt: nowIso(),
      });
    }
    if (outcome.proposal?.kind === "transaction") {
      proposeDraft({ ...outcome.proposal.draft, rawText }, outcome.proposal.stated, rawText);
    } else if (outcome.proposal?.kind === "payment") {
      push({
        id: genId(),
        role: "assistant",
        kind: "payment",
        entryId: outcome.proposal.entryId,
        summary: outcome.proposal.summary,
        patch: outcome.proposal.patch,
        createdAt: nowIso(),
      });
    }
  }

  /** Applies a payment BAi prepared, once she confirms it — through the normal save path. */
  function handlePaymentChoice(id: string, confirmed: boolean) {
    const message = messages.find((m) => m.id === id);
    if (!message || message.kind !== "payment" || message.resolved) return;
    if (confirmed) {
      const entry = state.entries.find((e) => e.id === message.entryId);
      if (!entry) {
        replace(id, { ...message, resolved: "cancelled", summary: `${message.summary} (That transaction no longer exists, so nothing was changed.)` });
        return;
      }
      const { id: entryId, ...rest } = entry;
      replaceEntry(entryId, { ...rest, ...message.patch });
    }
    replace(id, { ...message, resolved: confirmed ? "confirmed" : "cancelled" });
  }

  function handleEdit(id: string) {
    const message = messages.find((m) => m.id === id);
    if (!message || message.kind !== "entry") return;
    if (needsFullForm(message.draft)) {
      const saved = state.entries.find((e) => e.id === message.entryId);
      if (saved) {
        const { id: _savedId, ...draft } = saved;
        void _savedId;
        setFullEdit({ messageId: id, entryId: message.entryId, draft });
        return;
      }
    }
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
        onPaymentChoice={handlePaymentChoice}
        onEditReview={handleEditReview}
        onRetry={handleRetry}
        onGatePick={(id, text) => void handleGateChoice(id, text)}
        onGateRefine={(id, extra) => void handleGateRefine(id, extra)}
        onGateAskAsIs={(id) => void handleGateAskAsIs(id)}
        refiningGateId={refiningGateId}
        isTyping={submitting}
        isLookingUp={lookingUp}
      />
      {fullEdit && (
        <TransactionDialog
          open
          onOpenChange={(open) => !open && setFullEdit(null)}
          existing={{ ...fullEdit.draft, id: fullEdit.entryId ?? "draft" }}
          exec={isExecutive(currentUser)}
          onSave={(draft) => {
            const message = messages.find((m) => m.id === fullEdit.messageId);
            if (fullEdit.entryId) {
              replaceEntry(fullEdit.entryId, draft);
              if (message) replace(message.id, { id: message.id, role: "assistant", kind: "entry", entryId: fullEdit.entryId, draft, createdAt: message.createdAt });
            } else if (message && message.kind === "review") {
              // Still only proposed: the edited version goes back on the card to confirm.
              replace(message.id, { ...message, draft, stated: [...new Set([...message.stated, "sku", "quantity", "amount"])] });
            }
            setFullEdit(null);
          }}
        />
      )}
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
