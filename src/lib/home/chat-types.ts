import type { EntryDraft } from "@/lib/home/describe-entry";

export interface ClarifyOption {
  label: string;
  patch?: Partial<EntryDraft>;
  openEdit?: boolean;
}

export type ChatMessage =
  | { id: string; role: "user"; kind: "text"; text: string; createdAt: string }
  | { id: string; role: "assistant"; kind: "text"; text: string; createdAt: string }
  | { id: string; role: "assistant"; kind: "entry"; entryId: string; draft: EntryDraft; createdAt: string }
  | { id: string; role: "assistant"; kind: "entry-undone"; draft: EntryDraft; createdAt: string }
  | {
      id: string;
      role: "assistant";
      kind: "clarify";
      rawText: string;
      question: string;
      draft: EntryDraft;
      options: ClarifyOption[];
      createdAt: string;
    }
  | { id: string; role: "assistant"; kind: "quick-edit"; entryId: string | null; draft: EntryDraft; createdAt: string }
  | { id: string; role: "assistant"; kind: "insight"; text: string; createdAt: string }
  | { id: string; kind: "divider"; createdAt: string };
