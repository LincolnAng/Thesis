"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useViewMode } from "@/lib/summary/view-mode";
import { EXPENSE_CATEGORY_LABELS, formatNumber } from "@/lib/format";
import type { Entry } from "@/lib/store/types";

/**
 * Building blocks for Simple mode. Every Simple screen answers its question in a sentence
 * first, keeps to a few numbers, and uses colour only alongside words that say the same.
 */

export type Tone = "good" | "warn" | "bad" | "neutral";

const TONE_CARD: Record<Tone, string> = {
  good: "border-success/30 bg-success/[0.06]",
  warn: "border-[#9A6B12]/30 bg-[#9A6B12]/[0.06]",
  bad: "border-danger/30 bg-danger/[0.06]",
  neutral: "border-line/15 bg-white",
};

const TONE_TEXT: Record<Tone, string> = {
  good: "text-success",
  warn: "text-[#9A6B12]",
  bad: "text-danger",
  neutral: "text-foreground",
};

const TONE_BAR: Record<Tone, string> = {
  good: "bg-success",
  warn: "bg-[#C08552]",
  bad: "bg-danger",
  neutral: "bg-cacao",
};

/** The one big sentence a screen opens with. */
export function Headline({ tone = "neutral", children, sub }: { tone?: Tone; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className={`rounded-2xl border px-6 py-5 ${TONE_CARD[tone]}`}>
      <p className="font-display text-[22px] font-semibold leading-snug">{children}</p>
      {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Bold text in the tone's colour, for the number inside a sentence. */
export function Em({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={TONE_TEXT[tone]}>{children}</span>;
}

const TONE_PILL: Record<Tone, string> = {
  good: "bg-success/10 text-success",
  warn: "bg-[#9A6B12]/10 text-[#9A6B12]",
  bad: "bg-danger/10 text-danger",
  neutral: "bg-secondary text-muted-foreground",
};

/** A fuel-gauge bar with the sentence that explains it, and optionally a one-word status
 * ("Enough", "Running low") so the colour is never the only signal. */
export function Gauge({
  label,
  pct,
  text,
  tone = "neutral",
  status,
}: {
  label: string;
  pct: number;
  text: ReactNode;
  tone?: Tone;
  status?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {label}
          {status && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_PILL[tone]}`}>{status}</span>}
        </span>
        <span className="text-[13px] text-muted-foreground">{text}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#F0EEE6]">
        <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

/** A large, labelled action button — the main things a beginner does. */
export function BigButton({ icon: Icon, label, hint, onClick }: { icon: LucideIcon; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center gap-3 rounded-2xl border border-line/15 bg-white px-5 py-4 text-left transition hover:border-cacao/40 hover:shadow-sm"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cacao/10">
        <Icon className="h-5 w-5 text-cacao" strokeWidth={1.8} />
      </span>
      <span>
        <span className="block text-[15px] font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

/** A section heading in plain words, with an optional link on the right. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-[18px] font-semibold">{children}</h2>
      {right}
    </div>
  );
}

/** A white card holding a short list of sentences. */
export function SentenceList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/15 bg-white">{children}</div>;
}

export function SentenceRow({
  children,
  right,
  sub,
  onClick,
}: {
  children: ReactNode;
  right?: ReactNode;
  sub?: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{children}</span>
        {sub && <span className="mt-0.5 block text-[13px] text-muted-foreground">{sub}</span>}
      </span>
      {right && <span className="shrink-0 text-[15px] font-semibold">{right}</span>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-ivory">
      {body}
    </button>
  ) : (
    <div className="flex items-center gap-4 px-5 py-3.5">{body}</div>
  );
}

/** Where to go for the full detail, instead of showing it here. */
export function AdvancedHint({ what }: { what: string }) {
  const [, setMode] = useViewMode();
  return (
    <p className="text-center text-[13px] text-muted-foreground">
      Want {what}?{" "}
      <button type="button" onClick={() => setMode("advanced")} className="font-semibold text-cacao">
        Switch to Advanced
      </button>
    </p>
  );
}

/** "Sold 10 jars of Cocoa Crunch to Aling Nena" / "Paid Farm Supplier for cocoa beans". */
export function entrySentence(e: Entry): string {
  const qty = e.quantity != null ? `${formatNumber(e.quantity)} ${e.unit ?? "jars"} of ` : "";
  if (e.type === "SALE") return `Sold ${qty}${e.sku ?? "something"}${e.counterparty ? ` to ${e.counterparty}` : ""}`;
  const what = e.sku ?? (e.category ? (EXPENSE_CATEGORY_LABELS[e.category] ?? e.category).toLowerCase() : null);
  return `Paid${e.counterparty ? ` ${e.counterparty}` : ""}${what ? ` for ${qty}${what}` : ""}`;
}

export function shortDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function monthKeyOf(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKey(offset = 0, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthName(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long" });
}
