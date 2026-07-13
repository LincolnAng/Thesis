import { describeDraft, type EntryDraft } from "@/lib/home/describe-entry";
import type { ClarifyOption } from "@/lib/home/chat-types";

export interface ClarifyPrompt {
  question: string;
  options: ClarifyOption[];
}

export function buildClarifyPrompt(draft: EntryDraft): ClarifyPrompt {
  // The classic ambiguity: something left the shelf, but was it paid for?
  if (draft.type === "SALE" && !draft.priceType) {
    return {
      question: "Was this a sale or a giveaway?",
      options: [
        { label: "Sale", patch: { priceType: "standard" } },
        { label: "Free (giveaway)", patch: { type: "INVENTORY_OUT", amount: null, priceType: null } },
      ],
    };
  }

  if (draft.type === "EXPENSE" && !draft.category) {
    return {
      question: "What kind of expense was this?",
      options: [
        { label: "Ingredients", patch: { category: "raw_materials" } },
        { label: "Packaging", patch: { category: "packaging" } },
        { label: "Transport", patch: { category: "transport" } },
        { label: "Something else", openEdit: true },
      ],
    };
  }

  if (draft.type === "WASTE" || draft.type === "INVENTORY_OUT") {
    return {
      question: "Did the stock get thrown away, or was it given out for free?",
      options: [
        { label: "Thrown away / spoiled", patch: { type: "WASTE" } },
        { label: "Given away / free sample", patch: { type: "INVENTORY_OUT" } },
      ],
    };
  }

  return {
    question: `I think this is: ${describeDraft(draft)}. Is that right?`,
    options: [
      { label: "Yes, that's right", patch: {} },
      { label: "No, let me fix it", openEdit: true },
    ],
  };
}
