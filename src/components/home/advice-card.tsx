"use client";

import { ExternalLink, TriangleAlert } from "lucide-react";
import type { AdviceResult } from "@/app/api/advisor/route";

/**
 * Business advice, kept deliberately small.
 *
 * The first version of this card had a headline, a grounding paragraph, four numbered
 * recommendations with reasons and effort badges, a watch-outs box, a verification box and a
 * next step. It was thorough and nobody would read it — and length hides the one line that
 * actually changes what she does.
 *
 * So: the answer, one reason, at most three steps, one warning. Sources sit at the bottom
 * because an external claim she can't trace is worth less than one she can.
 */
export function AdviceCard({ advice }: { advice: AdviceResult }) {
  return (
    <div className="max-w-[560px] space-y-3 rounded-2xl border border-line/15 bg-white p-4">
      {advice.headline && <p className="font-display text-[17px] font-semibold leading-snug">{advice.headline}</p>}

      {advice.because && <p className="text-[13px] leading-relaxed text-muted-foreground">{advice.because}</p>}

      {advice.steps.length > 0 && (
        <ol className="space-y-2 border-t border-line/10 pt-3">
          {advice.steps.map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cacao text-[10px] font-bold text-ivory">
                {i + 1}
              </span>
              <div className="min-w-0">
                <span className="text-[13px] font-semibold">{step.do}</span>
                {step.detail && (
                  <span className="block text-[12px] leading-relaxed text-muted-foreground">{step.detail}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {advice.headsUp && (
        <p className="flex items-start gap-1.5 rounded-lg bg-[#9A6B12]/[0.07] px-3 py-2 text-[12px] leading-relaxed text-[#7A5410]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {advice.headsUp}
        </p>
      )}

      {advice.sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/10 pt-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Looked up</span>
          {advice.sources.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              title={s.url}
              className="inline-flex max-w-[220px] items-center gap-1 text-[12px] text-cacao hover:underline"
            >
              <span className="truncate">{s.what || s.url}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
