import type { EntryDraft } from "@/lib/home/describe-entry";
import type { AdviceResult } from "@/app/api/advisor/route";

export interface ClarifyOption {
  label: string;
  patch?: Partial<EntryDraft>;
  openEdit?: boolean;
}

export type ChatMessage =
  | { id: string; role: "user"; kind: "text"; text: string; createdAt: string; sessionId: string }
  | {
      id: string;
      role: "assistant";
      kind: "text";
      text: string;
      /** Set when the message reports a failure — carries the input to send again. */
      retryText?: string;
      createdAt: string;
      sessionId: string;
    }
  | { id: string; role: "assistant"; kind: "entry"; entryId: string; draft: EntryDraft; createdAt: string; sessionId: string }
  | { id: string; role: "assistant"; kind: "entry-undone"; draft: EntryDraft; createdAt: string; sessionId: string }
  | {
      id: string;
      role: "assistant";
      kind: "clarify";
      rawText: string;
      question: string;
      draft: EntryDraft;
      options: ClarifyOption[];
      createdAt: string;
      sessionId: string;
    }
  | {
      id: string;
      role: "assistant";
      kind: "quick-edit";
      entryId: string | null;
      draft: EntryDraft;
      createdAt: string;
      sessionId: string;
    }
  | { id: string; role: "assistant"; kind: "insight"; text: string; createdAt: string; sessionId: string }
  // Parsed but NOT yet written to the ledger. Nothing is saved until the owner presses the
  // confirm button on this card — the assistant proposes, it never records on its own.
  | {
      id: string;
      role: "assistant";
      kind: "review";
      rawText: string;
      draft: EntryDraft;
      /** Fields the owner actually said. Anything else the model filled is shown as a guess. */
      stated: string[];
      createdAt: string;
      sessionId: string;
    }
  // Business advice, grounded in the owner's own figures. Kept apart from "text" because it
  // has real structure — the "needs checking" list in particular has to stay visually distinct
  // from the parts that came from her own data.
  | {
      id: string;
      role: "assistant";
      kind: "advice";
      question: string;
      advice: AdviceResult;
      topic: string;
      createdAt: string;
      sessionId: string;
    }
  // Offered before a vague question is sent, never instead of sending it. The owner can pick a
  // sharper version, add her own words, or send what she originally typed.
  | {
      id: string;
      role: "assistant";
      kind: "prompt-gate";
      rawText: string;
      suggestions: string[];
      /** Why her message was judged vague, in her words. */
      reasons: string[];
      /** Set once she has chosen, so the card stops offering. */
      resolved?: boolean;
      createdAt: string;
      sessionId: string;
    }
  | { id: string; kind: "divider"; createdAt: string; label: string; sessionId: string }
  // Not shown in the thread — a metadata record of a custom name for its session,
  // synced through the same chat-history pipeline as everything else. The latest
  // one per session overrides the auto-derived (first-message) label.
  | { id: string; kind: "session-title"; createdAt: string; title: string; sessionId: string };

// Plain `Omit` collapses a union to its common keys, losing the discriminant-based
// per-variant shape — this distributes it over each member instead.
export type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
