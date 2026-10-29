"use client";

import { forwardRef } from "react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { VOICE_LANGS, useDictation } from "@/lib/home/use-voice";

/**
 * The message box, shaped like a card rather than a toolbar: the text area and the send
 * button live inside one rounded surface, and it grows with what's typed. Enter sends,
 * Shift+Enter adds a line. The mic types what's said into the box, to check before sending.
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
  const voice = useDictation(value, onChange);
  const send = () => {
    voice.stop();
    onSubmit();
  };
  return (
    <div
      className={cn(
        "rounded-[20px] border border-line/20 bg-card px-4 pb-2.5 pt-3.5 shadow-[0_2px_12px_rgba(20,20,19,0.05)] transition-colors focus-within:border-cacao/50",
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
            if (canSend) send();
          }
        }}
        className="field-sizing-content block max-h-60 min-h-12 w-full resize-none bg-transparent px-2 pt-1 text-base text-foreground outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center justify-between gap-2 pl-2 pt-1">
        <span className={cn("min-w-0 text-xs", voice.error ? "text-danger" : voice.listening ? "font-semibold text-cacao" : "text-muted-foreground")} aria-live="polite">
          {voice.error ?? (voice.listening ? "Listening… tap ■ when you're done" : "English, Tagalog or Bisaya")}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {voice.supported && (
            <>
              {/* Which language the mic listens for. */}
              <div className="flex rounded-full border border-line/15 p-0.5" role="group" aria-label="Voice language">
                {VOICE_LANGS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    aria-pressed={voice.lang === l.value}
                    disabled={voice.listening}
                    onClick={() => voice.setLang(l.value)}
                    className={cn(
                      "h-6 rounded-full px-2 text-[11px] font-semibold transition",
                      voice.lang === l.value ? "bg-cacao text-ivory" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label={voice.listening ? "Stop listening" : "Speak instead of typing"}
                aria-pressed={voice.listening}
                disabled={disabled}
                onClick={voice.toggle}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-30",
                  voice.listening ? "animate-pulse bg-danger text-white" : "border border-line/20 text-cacao hover:border-cacao/50",
                )}
              >
                {voice.listening ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
              </button>
            </>
          )}
          <button
            type="button"
            aria-label="Send message"
            disabled={!canSend}
            onClick={send}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-cacao text-ivory transition-opacity disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
});
