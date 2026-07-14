import type { EntryDraft } from "@/lib/home/describe-entry";

export interface ClarifyOption {
  label: string;
  patch?: Partial<EntryDraft>;
  openEdit?: boolean;
}

export type ChatMessage =
  | { id: string; role: "user"; kind: "text"; text: string; createdAt: string; sessionId: string }
  | { id: string; role: "assistant"; kind: "text"; text: string; createdAt: string; sessionId: string }
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
  | { id: string; kind: "divider"; createdAt: string; label: string; sessionId: string }
  // Not shown in the thread — a metadata record of a custom name for its session,
  // synced through the same chat-history pipeline as everything else. The latest
  // one per session overrides the auto-derived (first-message) label.
  | { id: string; kind: "session-title"; createdAt: string; title: string; sessionId: string };

// Plain `Omit` collapses a union to its common keys, losing the discriminant-based
// per-variant shape — this distributes it over each member instead.
export type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
