"use client";

import { Button } from "@/components/ui/button";
import type { ClarifyOption } from "@/lib/home/chat-types";

export function ClarifyCard({
  question,
  options,
  onPick,
}: {
  question: string;
  options: ClarifyOption[];
  onPick: (option: ClarifyOption) => void;
}) {
  return (
    <div className="w-full max-w-xs space-y-2.5 rounded-2xl border border-border bg-card p-3">
      <p className="text-sm text-foreground">{question}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button key={option.label} size="sm" variant="secondary" onClick={() => onPick(option)}>
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
