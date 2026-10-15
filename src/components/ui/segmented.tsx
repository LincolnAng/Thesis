"use client";

import type { LucideIcon } from "lucide-react";

export interface Choice<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

/** The short either/or choices: one connected bar of equal segments, icon beside the label. */
export function Segmented<T extends string>({
  choices,
  value,
  onChange,
  ariaLabel,
}: {
  choices: Choice<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex w-full gap-1 rounded-xl bg-secondary p-1" role="radiogroup" aria-label={ariaLabel}>
      {choices.map(({ value: v, label, icon: Icon }) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-center text-[13px] font-semibold leading-tight transition active:scale-[0.97] ${
              on ? "bg-cacao text-ivory shadow-sm" : "text-muted-foreground hover:bg-card/70"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.9} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
