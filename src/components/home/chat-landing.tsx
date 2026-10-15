"use client";

import { useState } from "react";
import { ChatComposer } from "@/components/home/chat-composer";
import { useCurrentUser } from "@/lib/auth/current-user";

/**
 * The start screen: a greeting for whoever is signed in, and one message box — nothing else. There is no Ask or
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
      <h1 className="mb-6 font-display text-[34px] font-semibold tracking-tight text-foreground">
        {user ? `Hello, ${user.name}` : "Hello"}
      </h1>

      <ChatComposer
        value={value}
        onChange={setValue}
        onSubmit={() => submit(value)}
        disabled={disabled}
        autoFocus
        className="w-full"
        placeholder="Type a question, or what happened — e.g. sold 10 to Aling Nena"
      />
    </div>
  );
}
