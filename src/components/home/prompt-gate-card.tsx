"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * Offered when a question is too vague to answer well.
 *
 * The owner's prompts are often a topic rather than a question, and the answer that comes back
 * is correspondingly general — but still warm and confident, so there is nothing to notice. This
 * card makes the vagueness visible and offers versions written against her real products and
 * figures.
 *
 * Three rules it must keep:
 * - It blocks. There is no "send it anyway", because the answer to a general question reads
 *   exactly like the answer to a good one and she has no way to tell them apart.
 * - It always leaves a way through. "Others" takes her own words, and the moment what she has
 *   written is specific enough it goes straight to the advisor unrewritten. She can ask
 *   anything; she cannot ask it vaguely.
 * - It explains itself. "I'd be guessing which product you mean" is a reason she can learn from;
 *   a bare list of alternatives is not.
 */

export function PromptGateCard({
  rawText,
  suggestions,
  reasons,
  resolved,
  onPick,
  onRefine,
  refining,
}: {
  rawText: string;
  suggestions: string[];
  reasons: string[];
  resolved?: boolean;
  onPick: (text: string) => void;
  onRefine: (extra: string) => void;
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
          <p className="text-[13px] font-semibold">That one&apos;s too general — pick a sharper question</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {`You asked "${rawText}". `}
            {reasons.length > 0 ? `${reasons[0].charAt(0).toUpperCase()}${reasons[0].slice(1)}, ` : ""}
            and a general question gets a general answer that still sounds confident. Pick one of these, or add a few
            words of your own.
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
            className="rounded-xl border border-line/15 bg-white px-3.5 py-2.5 text-left text-[13px] transition hover:border-cacao/40 hover:bg-secondary/40 disabled:opacity-50"
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
            className="h-9 min-w-[16rem] flex-1 rounded-lg border border-input bg-white px-2.5 text-[13px] outline-none focus:border-cacao"
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
            onClick={() => setShowOther(true)}
            className="text-[12px] font-semibold text-cacao hover:underline"
          >
            None of these — let me add detail
          </button>
        </div>
      )}
    </div>
  );
}
