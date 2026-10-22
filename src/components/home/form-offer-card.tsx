"use client";

import { ClipboardPen } from "lucide-react";

/**
 * Shown under BAi's question when something can't be recorded yet — a detail is missing, or the
 * AI couldn't be reached. Answering in the chat works; so does opening the full form, already
 * filled in with whatever was understood, and finishing it by hand.
 */
export function FormOfferCard({ missing, hasDraft, onOpen }: { missing: string[]; hasDraft: boolean; onOpen: () => void }) {
  return (
    <div className="w-full max-w-sm space-y-2.5 rounded-2xl border border-border bg-card p-3">
      {missing.length > 0 ? (
        <div>
          <p className="text-sm font-semibold text-foreground">Still needed before it can be logged</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-foreground">
            {missing.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
          <p className="mt-1.5 text-xs text-muted-foreground">Reply here, or fill it in on the form.</p>
        </div>
      ) : (
        <p className="text-sm text-foreground">You can log it yourself on the form instead.</p>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-cacao px-4 text-[14px] font-semibold text-ivory"
      >
        <ClipboardPen className="h-4 w-4" />
        {hasDraft ? "Finish it on the form" : "Log it on the form"}
      </button>
    </div>
  );
}
