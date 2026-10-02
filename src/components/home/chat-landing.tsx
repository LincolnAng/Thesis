"use client";

import { useState } from "react";
import { Box, TrendingUp, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import { ChatComposer } from "@/components/home/chat-composer";
import { QuickLog } from "@/components/home/quick-log";
import { useStore } from "@/lib/store/use-store";
import { ownerName } from "@/lib/summary/business-config";
import { useViewMode } from "@/lib/summary/view-mode";

interface Question {
  icon: LucideIcon;
  /** What the chip says: a thing, in one or two words. */
  label: string;
  /** What actually gets asked — the full question, kept specific. */
  text: string;
  /** Shown in Simple mode too, rather than only in Advanced. */
  simple?: boolean;
}

/**
 * The chips under the message box.
 *
 * The label is deliberately not the question. A row of four question-shaped sentences is
 * four sentences to read before tapping anything, which is slower than reading four nouns —
 * so the chip names the subject ("Running low") and the question sent underneath stays as
 * specific as it ever was. Nothing was simplified about what gets asked; the asking got
 * shorter to look at. The full wording is on the tooltip for anyone who wants it.
 */
const QUESTIONS: Question[] = [
  {
    icon: TrendingUp,
    label: "Money",
    text: "How much did I make this month, and how does that compare with last month?",
    simple: true,
  },
  {
    icon: TriangleAlert,
    label: "Running low",
    text: "What's running low on stock, and when will it run out?",
    simple: true,
  },
  { icon: Users, label: "Top buyers", text: "Who are my top customers, and what do they usually buy?" },
  { icon: Box, label: "What to make", text: "What should I make next, and how many batches?" },
];

/**
 * The start screen: a greeting by name, one big message box, buttons for logging what
 * happened, and a few questions to tap.
 *
 * Logging lives in {@link QuickLog} as a real form rather than as example sentences pasted
 * into the message box — typing over a sample sale is slower than filling in the fields,
 * and it only ever helped the first time.
 */
export function ChatLanding({ onSubmit, disabled }: { onSubmit: (text: string) => void; disabled?: boolean }) {
  const { businessSettings } = useStore();
  const [value, setValue] = useState("");
  const name = ownerName(businessSettings);
  const [mode] = useViewMode();
  const simple = mode === "simple";

  const questions = simple ? QUESTIONS.filter((q) => q.simple) : QUESTIONS;

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-4">
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cacao font-display text-lg font-bold text-ivory">M</div>
        <h1 className="font-display text-[38px] font-semibold tracking-tight text-foreground">{name ? `Hi, ${name}` : "Hi there"}</h1>
      </div>
      <p className="mb-8 text-base text-muted-foreground">What happened in the business today?</p>

      <ChatComposer
        value={value}
        onChange={setValue}
        onSubmit={() => submit(value)}
        disabled={disabled}
        autoFocus
        className="w-full"
      />

      <div className="mt-5 w-full">
        <QuickLog />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="text-[13px] text-muted-foreground">Or ask:</span>
        {questions.map((q) => (
          <button
            key={q.label}
            type="button"
            disabled={disabled}
            onClick={() => submit(q.text)}
            title={q.text}
            className="flex items-center gap-2 rounded-full border border-line/15 bg-white px-3.5 py-2 text-[13px] text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <q.icon className="h-4 w-4 text-muted-foreground" />
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
