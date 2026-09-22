"use client";

import { forwardRef } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The message box, shaped like a card rather than a toolbar: the text area and the send
 * button live inside one rounded surface, and it grows with what's typed. Enter sends,
 * Shift+Enter adds a line.
 */
export const ChatComposer = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    disabled?: boolean;
    placeholder?: string;
    autoFocus?: boolean;
    className?: string;
  }
>(function ChatComposer({ value, onChange, onSubmit, disabled, placeholder, autoFocus, className }, ref) {
  const canSend = !disabled && value.trim() !== "";
  return (
    <div
      className={cn(
        "rounded-[20px] border border-line/20 bg-white px-4 pb-2.5 pt-3.5 shadow-[0_2px_12px_rgba(20,20,19,0.05)] transition-colors focus-within:border-cacao/50",
        className,
      )}
    >
      <textarea
        ref={ref}
        autoFocus={autoFocus}
        value={value}
        rows={1}
        placeholder={placeholder ?? "Tell me what you sold, bought or made — or ask anything"}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (canSend) onSubmit();
          }
        }}
        className="field-sizing-content block max-h-60 min-h-12 w-full resize-none bg-transparent px-2 pt-1 text-base text-foreground outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center justify-between pl-2 pt-1">
        <span className="text-xs text-muted-foreground">English, Tagalog or Bisaya</span>
        <button
          type="button"
          aria-label="Send message"
          disabled={!canSend}
          onClick={onSubmit}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-cacao text-ivory transition-opacity disabled:opacity-30"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});
