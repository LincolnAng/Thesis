"use client";

import { UNIT_GROUPS } from "@/lib/units";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Unit field used everywhere a quantity is entered.
 *
 * Type what you measure in, with the familiar units offered as you type. It was a dropdown
 * whose last entry was "Type my own…", which is an escape hatch nobody scrolls far enough to
 * find — and the units a shop actually uses (bilao, sachet, tray of 30) are exactly the ones
 * a fixed list will never hold.
 */
let listId = 0;

export function UnitSelect({
  value,
  onChange,
  className,
  allowEmpty = true,
  emptyLabel = "No unit",
}: {
  value: string | null;
  onChange: (unit: string | null) => void;
  className?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  // One id per field so two of these on a screen do not share a suggestion list.
  const [id] = useState(() => `units-${++listId}`);
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    setDraft(null);
    if (!trimmed) {
      if (allowEmpty) onChange(null);
      return;
    }
    onChange(trimmed);
  };

  return (
    <>
      <input
        list={id}
        value={draft ?? value ?? ""}
        placeholder={allowEmpty ? emptyLabel : "kg, pcs, bilao…"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(null);
        }}
        className={cn("h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:border-cacao", className)}
      />
      <datalist id={id}>
        {UNIT_GROUPS.flatMap((group) => group.units).map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
    </>
  );
}
