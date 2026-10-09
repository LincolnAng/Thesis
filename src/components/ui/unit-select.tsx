"use client";

import { UNIT_GROUPS, ALL_UNITS } from "@/lib/units";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Unit picker used everywhere a quantity is entered. Grouped so volume/weight units are as
 * reachable as counts — free text was the only option before, which is how a 250ml sale got
 * recorded as a bare "1 unit".
 */
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
  // A unit that isn't one of the presets (an older entry, or something the AI produced) is
  // kept as its own option so opening the form never silently rewrites it.
  const custom = value && !ALL_UNITS.includes(value) ? value : null;

  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");

  // A dropdown can only offer units somebody thought of in advance, and she sells things we
  // have not met — "bilao", "sachet", "tray of 30". Typing one is a normal thing to want, so
  // the list carries its own escape hatch rather than being the whole answer.
  if (typing) {
    const commit = () => {
      const trimmed = draft.trim();
      if (trimmed) onChange(trimmed);
      setTyping(false);
      setDraft("");
    };
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setTyping(false);
              setDraft("");
            }
          }}
          placeholder="e.g. bilao"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:border-cacao"
        />
      </div>
    );
  }

  return (
    <select
      className={cn("h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm", className)}
      value={value ?? ""}
      onChange={(e) => {
        if (e.target.value === "__type__") {
          setDraft(value ?? "");
          setTyping(true);
          return;
        }
        onChange(e.target.value || null);
      }}
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {custom && <option value={custom}>{custom}</option>}
      {UNIT_GROUPS.map((group) => (
        <optgroup key={group.group} label={group.group}>
          {group.units.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </optgroup>
      ))}
      <option value="__type__">Type my own…</option>
    </select>
  );
}
