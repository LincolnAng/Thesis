import type { EntryDraft } from "@/lib/home/describe-entry";
import type { EntryType } from "./types";

/** A fresh, empty draft for a manual entry form — no AI involved. */
export function blankEntryDraft(type: EntryType, rawText = "Manual entry"): EntryDraft {
  return {
    timestamp: new Date().toISOString(),
    type,
    amount: null,
    quantity: null,
    unit: null,
    sku: null,
    counterparty: null,
    location: null,
    priceType: type === "SALE" ? "standard" : null,
    category: type === "EXPENSE" ? "misc" : null,
    rawText,
    confidence: 1,
    notes: null,
  };
}
