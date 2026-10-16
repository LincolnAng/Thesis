"use client";

import type { ReactNode } from "react";

/**
 * The few shapes every page shares, so a pill, a switch or a button looks the same wherever it
 * appears. Before this each screen drew its own: three switch styles, two carousel sizes on one
 * page, and buttons a size apart from one tab to the next.
 */

export type PillTone = "good" | "bad" | "warn" | "brand" | "neutral";

const PILL_TONE: Record<PillTone, string> = {
  good: "bg-success/10 text-success",
  bad: "bg-danger/10 text-danger",
  warn: "bg-[var(--status-warning)]/15 text-[var(--status-warning)]",
  brand: "bg-cacao/10 text-cacao",
  neutral: "bg-track text-muted-foreground",
};

/** A status in a word or two — "Paid", "1 short", "All good". */
export function Pill({ tone = "neutral", className = "", children, title }: { tone?: PillTone; className?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${PILL_TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

/**
 * A choice between a few options in place — Month / Week / Day, Fastest / Balanced, Small /
 * Large. The same height as the date carousel (CarouselNav) it often sits beside.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: ReactNode; title?: string; className?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** What the choice is about, for screen readers. */
  label: string;
}) {
  return (
    <div className="inline-flex w-fit max-w-full rounded-full border border-line/15 bg-card p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] transition ${
            value === o.value ? "bg-cacao font-semibold text-ivory" : "font-medium text-muted-foreground hover:text-foreground"
          } ${o.className ?? ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Buttons: one size for a page's actions, primary (filled) or secondary (outlined). */
export const BUTTON = {
  primary: "inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-cacao px-4 py-2.5 text-[13px] font-semibold text-ivory transition hover:bg-cacao/90 disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-line/20 bg-card px-4 py-2.5 text-[13px] font-semibold transition hover:border-cacao/50 disabled:opacity-50",
};

/** A rounded on/off button beside a carousel — "All time", "Today". The carousel's own height. */
export function toggleButton(on = false) {
  return `inline-flex h-[38px] items-center rounded-full border px-4 text-[13px] font-semibold transition ${
    on ? "border-cacao bg-cacao text-ivory" : "border-line/15 bg-card text-muted-foreground hover:text-foreground"
  }`;
}
