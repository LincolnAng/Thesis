"use client";

import { useState } from "react";
import { Store, TruckIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store/use-store";
import { nameKey, rankByName } from "@/lib/summary/name-match";
import { cn } from "@/lib/utils";
import type { Supplier } from "@/lib/store/types";

/**
 * Who an expense was paid to, typed rather than picked.
 *
 * It behaves like the buyer field: past suppliers are suggested as you type, near-misses
 * included, so "manila glas" finds "Manila Glass & Jar Co." instead of quietly starting a
 * second row for the same shop. A name that really is new is simply typed — it becomes a
 * supplier when the expense is saved, with no separate "add supplier" step to remember.
 */
export function SupplierNameInput({
  value,
  onChange,
  className,
  placeholder = "Shop or supplier",
}: {
  value: string | null;
  onChange: (name: string | null) => void;
  className?: string;
  placeholder?: string;
}) {
  const { suppliers } = useStore();
  const [open, setOpen] = useState(false);
  const suggestions = rankByName(value ?? "", suppliers, (s) => s.name);

  const typed = (value ?? "").trim();
  const isKnown = suppliers.some((s) => nameKey(s.name) === nameKey(typed));
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
              <TruckIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                New supplier: <span className="font-medium text-foreground">{typed}</span>
              </span>
            </div>
          )}
          {suggestions.map((supplier: Supplier) => (
            <button
              key={supplier.id}
              type="button"
              // onMouseDown fires before the input's blur, so the pick isn't lost.
              onMouseDown={() => {
                onChange(supplier.name);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground">{supplier.name}</span>
              </span>
              {supplier.items && (
                <span className="shrink-0 truncate text-xs text-muted-foreground">{supplier.items}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
