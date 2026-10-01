"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * How many, with arrows. Counting up from zero by tapping is both faster and harder to get
 * wrong on a phone than typing into a bare number field, but the field is still a field —
 * someone logging 48 jars types 48 rather than tapping 48 times.
 */
export function QuantityStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  className,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min?: number;
  className?: string;
}) {
  const current = value ?? 0;
  const nudge = (by: number) => onChange(Math.max(min, Math.round((current + by) * 100) / 100));

  return (
    <div className={cn("flex h-9 items-stretch overflow-hidden rounded-md border border-input", className)}>
      <button
        type="button"
        aria-label="One less"
        disabled={current <= min}
        onClick={() => nudge(-step)}
        className="flex w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center border-x border-input px-1">
        <input
          type="number"
          inputMode="decimal"
          aria-label="Quantity"
          className="min-w-0 flex-1 bg-transparent p-0 text-center text-sm leading-none tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={value === null ? 0 : value}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
      <button
        type="button"
        aria-label="One more"
        onClick={() => nudge(step)}
        className="flex w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
