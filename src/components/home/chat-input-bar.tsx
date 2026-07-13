"use client";

import { Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function ChatInputBar({
  value,
  onChange,
  onSubmit,
  submitting,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <div className="sticky bottom-16 z-30 border-t border-border bg-background px-4 py-3 min-[900px]:bottom-0">
      <div className="mx-auto flex w-full max-w-[720px] items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Type what you sold or bought…"
          rows={1}
          className="min-h-11 resize-none rounded-2xl"
        />
        <Button
          size="icon"
          aria-label="Send message"
          className="h-11 w-11 shrink-0 rounded-full"
          onClick={onSubmit}
          disabled={submitting || !value.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
