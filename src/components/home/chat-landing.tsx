"use client";

import { useState } from "react";
import { ChocolateBarLogo } from "@/components/ui/chocolate-bar-logo";
import { ChatComposer } from "@/components/home/chat-composer";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { useStore } from "@/lib/store/use-store";
import { fullName } from "@/lib/summary/product-sizes";

interface ExampleGroup {
  title: string;
  /** Money topics are hidden from employees, whose screens never receive those figures. */
  executiveOnly?: boolean;
  examples: string[];
}

/**
 * The start screen: BAi greets whoever is signed in, with one message box. There is no Ask or
 * Log to choose first — BAi works out whether a message is a question about the shop, a general
 * question, something to look up online, or something to record, and anything it records is
 * shown for checking before it's saved.
 *
 * The examples are just that: tap one to send it, or type anything.
 */
export function ChatLanding({ onSubmit, disabled }: { onSubmit: (text: string) => void; disabled?: boolean }) {
  const { products } = useStore();
  const user = useCurrentUser();
  const exec = isExecutive(user);
  const [value, setValue] = useState("");

  const product = products[0] ? fullName(products[0], products) : "Cacao Tablea";
  const groups: ExampleGroup[] = [
    { title: "The shop", examples: ["How much did we sell this month?", "Which products sell the most?", "Which products are running low?"] },
    { title: "Money", executiveOnly: true, examples: ["Which customers still owe us money?", "What payments are overdue?", "How much did we spend on supplies this month?"] },
    { title: "Record something", examples: [`Sold 5 ${product} to Aling Nena`, `3 ${product} spoiled`, ...(exec ? ["Paid ₱850 for electricity by bank transfer, BDO"] : [])] },
    { title: "Anything else", examples: ["What's happening in the cocoa market right now?", "Help me write a message to a supplier", "Explain cash flow simply"] },
  ];

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col items-center px-4">
      <div className="mb-1 flex items-center gap-3">
        <span className="flex items-center gap-1.5 rounded-xl bg-cacao/10 px-2.5 py-1.5">
          <ChocolateBarLogo className="h-7 w-6" />
          <span className="font-display text-[15px] font-bold text-cacao">BAi</span>
        </span>
        <h1 className="font-display text-[34px] font-semibold tracking-tight text-foreground">
          {user ? `Hello, ${user.name}` : "Hello"}
        </h1>
      </div>
      <p className="mb-6 text-center text-base text-muted-foreground">
        Ask anything — about the shop, or not — or tell me what happened and I&apos;ll get it ready to record.
      </p>

      <ChatComposer
        value={value}
        onChange={setValue}
        onSubmit={() => submit(value)}
        disabled={disabled}
        autoFocus
        className="w-full"
        placeholder="Type a question, or what happened — e.g. sold 10 to Aling Nena"
      />

      <div className="mt-6 grid w-full grid-cols-1 gap-3 min-[640px]:grid-cols-2">
        {groups
          .filter((g) => exec || !g.executiveOnly)
          .map((g) => (
            <div key={g.title} className="space-y-1.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">{g.title}</p>
              {g.examples.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={disabled}
                  onClick={() => submit(q)}
                  className="block min-h-11 w-full rounded-xl border border-line/15 bg-card px-3.5 py-2.5 text-left text-[14px] transition hover:border-cacao/40 hover:bg-secondary/40 disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          ))}
      </div>
      <p className="mt-4 text-center text-[13px] text-muted-foreground">
        Answers about the shop come from your records; when they&apos;re missing, BAi says so instead of guessing. Online
        answers list where they came from. Nothing is saved until you press Confirm.
      </p>
    </div>
  );
}
