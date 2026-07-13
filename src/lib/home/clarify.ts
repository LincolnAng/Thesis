import { describeDraft, type EntryDraft } from "@/lib/home/describe-entry";
import type { ClarifyOption } from "@/lib/home/chat-types";

export interface ClarifyPrompt {
  question: string;
  options: ClarifyOption[];
}

/**
 * Defensive fallback only — the assistant is expected to generate its own specific
 * clarifyQuestion/clarifyOptions for any ambiguous entry. This generic "is this right?"
 * only fires if the model flags low confidence but doesn't supply one.
 */
export function buildClarifyPrompt(draft: EntryDraft): ClarifyPrompt {
  return {
    question: `I think this is: ${describeDraft(draft)}. Is that right?`,
    options: [
      { label: "Yes, that's right", patch: {} },
      { label: "No, let me fix it", openEdit: true },
    ],
  };
}
