"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * Offered when a question names a topic but not a decision ("help me with pricing").
 *
 * The answer to a topic is correspondingly general — but still warm and confident, so there is
 * nothing to notice. This card makes that visible and offers sharper versions written against
 * her real products and figures.
 *
 * It suggests; it does not block. It used to have no "send it anyway", and in practice that
 * stopped ordinary questions — anything short, or about a product the gate's word list had never
 * heard of — from being answered at all. BAi is meant to take any question, so "Ask as I wrote
 * it" always sends her own words unchanged. The card still explains itself, because "I'd be
 * guessing which product you mean" is a reason she can learn from.
 */

export function PromptGateCard({
  rawText,
  suggestions,
  reasons,
  resolved,
  onPick,
  onRefine,
  onAskAsIs,
  refining,
}: {
  rawText: string;
  suggestions: string[];
  reasons: string[];
  resolved?: boolean;
  onPick: (text: string) => void;
  onRefine: (extra: string) => void;
  /** Send the question exactly as she wrote it. */
  onAskAsIs: () => void;
  refining?: boolean;
}) {
  const [showOther, setShowOther] = useState(false);
  const [extra, setExtra] = useState("");

  function submitExtra() {
    const text = extra.trim();
    if (!text) return;
    onRefine(text);
    setExtra("");
    setShowOther(false);
  }

  return (
    <div className="max-w-[640px] space-y-3 rounded-2xl border border-cacao/25 bg-cacao/[0.03] p-4">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cacao" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Want a sharper answer?</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {`You asked "${rawText}". `}
            {reasons.length > 0 ? `${reasons[0].charAt(0).toUpperCase()}${reasons[0].slice(1)}, ` : ""}
            so the answer may be general. Pick one of these for a more specific one, or ask it as you wrote it.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={resolved}
            onClick={() => onPick(s)}
            className="rounded-xl border border-line/15 bg-card px-3.5 py-2.5 text-left text-[13px] transition hover:border-cacao/40 hover:bg-secondary/40 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {showOther && !resolved && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitExtra();
              if (e.key === "Escape") setShowOther(false);
            }}
            placeholder="Which product? Which month? What are you deciding?"
            className="h-9 min-w-[16rem] flex-1 rounded-lg border border-input bg-card px-2.5 text-[13px] outline-none focus:border-cacao"
          />
          <button
            type="button"
            onClick={submitExtra}
            disabled={!extra.trim() || refining}
            className="rounded-[10px] bg-cacao px-3.5 py-2 text-xs font-semibold text-ivory disabled:opacity-40"
          >
            {refining ? "Thinking…" : "Try again"}
          </button>
        </div>
      )}

      {!resolved && !showOther && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line/10 pt-2.5">
          <button
            type="button"
            onClick={onAskAsIs}
            className="rounded-[10px] bg-cacao px-3.5 py-2 text-xs font-semibold text-ivory"
          >
            Ask as I wrote it
          </button>
          <button
            type="button"
            onClick={() => setShowOther(true)}
            className="text-[12px] font-semibold text-cacao hover:underline"
          >
            Add detail instead
          </button>
        </div>
      )}
    </div>
  );
}
