"use client";

import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store/use-store";
import { formatPeso } from "@/lib/format";
import { customerKey, deriveCustomers, suggestCustomers } from "@/lib/summary/customers";
import { cn } from "@/lib/utils";

/**
 * Buyer name field with like-spelling suggestions from past sales. Typing "aling nina" when
 * "Aling Nena" already exists surfaces her instead of quietly starting a second customer —
 * but any new name can still be typed straight in, since the list is only a suggestion.
 */
export function CustomerNameInput({
  value,
  onChange,
  className,
  placeholder = "Buyer name",
}: {
  value: string | null;
  onChange: (name: string | null) => void;
  className?: string;
  placeholder?: string;
}) {
  const { entries } = useStore();
  const [open, setOpen] = useState(false);
  const customers = deriveCustomers(entries);
  const suggestions = suggestCustomers(value ?? "", customers);

  const typed = (value ?? "").trim();
  const isKnown = customers.some((c) => c.key === customerKey(typed));
  const showNewHint = typed !== "" && !isKnown;

  return (
    <div className={cn("relative", className)}>
      <Input
        className="h-9"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value || null)}
        onFocus={() => setOpen(true)}
        // Delayed so a click on a suggestion registers before the list unmounts.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />

      {open && (suggestions.length > 0 || showNewHint) && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-md">
          {showNewHint && (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
              <UserPlus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                New customer: <span className="font-medium text-foreground">{typed}</span>
              </span>
            </div>
          )}
          {suggestions.map((c) => (
            <button
              key={c.key}
              type="button"
              // onMouseDown fires before the input's blur, so the pick isn't lost.
              onMouseDown={() => {
                onChange(c.name);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground">{c.name}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {c.orderCount} {c.orderCount === 1 ? "order" : "orders"} · {formatPeso(c.totalSpent)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
