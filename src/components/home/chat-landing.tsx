"use client";

import { useState } from "react";
import { ChocolateBarLogo } from "@/components/ui/chocolate-bar-logo";
import { ChatComposer } from "@/components/home/chat-composer";
import { useCurrentUser } from "@/lib/auth/current-user";

/**
 * The start screen: BAi greets whoever is signed in, with one message box. There is no Ask or
 * Log to choose first — BAi works out whether a message is a question about the shop, a general
 * question, something to look up online, or something to record, and anything it records is
 * shown for checking before it's saved.
 */
export function ChatLanding({ onSubmit, disabled }: { onSubmit: (text: string) => void; disabled?: boolean }) {
  const user = useCurrentUser();
  const [value, setValue] = useState("");

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

      <p className="mt-4 text-center text-[13px] text-muted-foreground">
        Answers about the shop come from your records; when they&apos;re missing, BAi says so instead of guessing. Online
        answers list where they came from. Nothing is saved until you press Confirm.
      </p>
    </div>
  );
}
