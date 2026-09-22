"use client";

import { useRef, useState } from "react";
import { Box, Receipt, TrendingUp, TriangleAlert, Users, Wallet, type LucideIcon } from "lucide-react";
import { ChatComposer } from "@/components/home/chat-composer";
import { useStore } from "@/lib/store/use-store";
import { ownerName } from "@/lib/summary/business-config";

interface Prompt {
  icon: LucideIcon;
  label: string;
  text: string;
  /** "send" asks right away; "fill" puts an example in the box to edit first — a sale
   * shouldn't be logged from sample numbers the owner never actually said. */
  mode: "send" | "fill";
}

/**
 * The start screen: a greeting by name, one big message box, and a few prompts to tap.
 * Used by Home and by an empty Ask AI conversation, so starting fresh looks the same
 * wherever you are.
 */
export function ChatLanding({ onSubmit, disabled }: { onSubmit: (text: string) => void; disabled?: boolean }) {
  const { businessSettings, products } = useStore();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const name = ownerName(businessSettings);
  const product = products[0]?.name ?? "Classic Cocoa Spread";

  const prompts: Prompt[] = [
    { icon: Receipt, label: "Log a sale", text: `Sold 10 jars of ${product} to Aling Nena, 1,800`, mode: "fill" },
    { icon: Wallet, label: "Log an expense", text: "Bought 5 kg cocoa beans, 450", mode: "fill" },
    { icon: Box, label: "Made a batch", text: `Made a batch of ${product}`, mode: "fill" },
    { icon: TrendingUp, label: "How am I doing?", text: "How much did I make this month?", mode: "send" },
    { icon: TriangleAlert, label: "What's running low?", text: "What's running low on stock?", mode: "send" },
    { icon: Users, label: "Top customers", text: "Who are my top customers?", mode: "send" },
  ];

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  function pick(prompt: Prompt) {
    if (prompt.mode === "send") {
      submit(prompt.text);
      return;
    }
    setValue(prompt.text);
    // Focus and put the caret at the end, so the owner can change the numbers straight away.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-4">
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cacao font-display text-lg font-bold text-ivory">M</div>
        <h1 className="font-display text-[38px] font-semibold tracking-tight text-foreground">{name ? `Hi, ${name}` : "Hi there"}</h1>
      </div>
      <p className="mb-8 text-base text-muted-foreground">What happened in the business today?</p>

      <ChatComposer
        ref={inputRef}
        value={value}
        onChange={setValue}
        onSubmit={() => submit(value)}
        disabled={disabled}
        autoFocus
        className="w-full"
      />

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {prompts.map((p) => (
          <button
            key={p.label}
            type="button"
            disabled={disabled && p.mode === "send"}
            onClick={() => pick(p)}
            title={p.text}
            className="flex items-center gap-2 rounded-full border border-line/15 bg-white px-3.5 py-2 text-[13px] text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <p.icon className="h-4 w-4 text-muted-foreground" />
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
