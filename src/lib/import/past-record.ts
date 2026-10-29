/**
 * Entries brought in from the shop's old spreadsheets are records of what already happened:
 * the stock they moved was counted long ago. They carry this marker (in rawText, which every
 * entry has and the sheet keeps), and the store never moves stock for them — not when they're
 * added, changed or deleted.
 */
export const PAST_RECORD = "Imported past record (stock not moved)";

export const isPastRecord = (e: { rawText?: string | null }) => e.rawText === PAST_RECORD;
