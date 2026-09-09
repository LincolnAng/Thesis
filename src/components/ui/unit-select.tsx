"use client";

import { UNIT_GROUPS, ALL_UNITS } from "@/lib/units";
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

  return (
    <select
      className={cn("h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm", className)}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
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
    </select>
  );
}
