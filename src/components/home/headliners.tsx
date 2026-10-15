"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert, Info, ThumbsUp, TriangleAlert } from "lucide-react";
import type { Headliner, HeadlinerTone } from "@/lib/home/today";

const TONE: Record<HeadlinerTone, { icon: typeof Info; ring: string; iconClass: string; label: string }> = {
  urgent: { icon: CircleAlert, ring: "border-danger/35", iconClass: "text-danger", label: "Needs action" },
  watch: { icon: TriangleAlert, ring: "border-[var(--status-warning)]/40", iconClass: "text-[var(--status-warning)]", label: "Keep an eye on" },
  good: { icon: ThumbsUp, ring: "border-line/15", iconClass: "text-success", label: "Going well" },
  info: { icon: Info, ring: "border-line/15", iconClass: "text-cacao", label: "Good to know" },
};

/**
 * What needs attention, as sentences: the headline, the figure behind it, and where to act.
 * Most urgent first. Replaces the charts that used to open Home.
 */
export function Headliners({ items }: { items: Headliner[] }) {
  return (
    <section className="space-y-3" aria-labelledby="headliners-title">
      <h2 id="headliners-title" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        What needs attention
      </h2>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-line/15 bg-card p-5 text-sm text-muted-foreground">
          Nothing needs attention right now. Headliners appear here as sales, stock and expenses are recorded.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
          {items.map((h) => {
            const tone = TONE[h.tone];
            return (
              <li key={h.id} className={`flex flex-col gap-2 rounded-2xl border bg-card p-5 ${tone.ring}`}>
                <span className={`flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide ${tone.iconClass}`}>
                  <tone.icon className="h-4 w-4" />
                  {tone.label}
                </span>
                <p className="font-display text-[18px] font-semibold leading-snug">{h.title}</p>
                <p className="text-[14px] leading-relaxed text-muted-foreground">{h.detail}</p>
                <Link href={h.href} className="mt-auto inline-flex items-center gap-1 pt-1 text-[13px] font-semibold text-cacao hover:underline">
                  {h.linkLabel}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
