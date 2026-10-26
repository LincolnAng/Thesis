"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchOption {
  value: string;
  label: string;
  /** A heading the option sits under — a product family, "Ingredients". */
  group?: string;
  /** Small text after the label — "3 kg in it", a date. Searched too. */
  hint?: string;
}

const FIELD = "flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-[15px] outline-none focus:border-cacao";

/**
 * A dropdown you can type into: it looks like a select, and opening it gives a search box over
 * the list, so a long list of products or materials is a few letters away instead of a scroll.
 * Arrow keys and Enter work; Escape or a click elsewhere closes it.
 */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "Choose…",
  ariaLabel,
  className,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder?: string;
  ariaLabel?: string;
  /** Classes for the closed box — defaults to the app's 44px field. */
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const picked = options.find((o) => o.value === value);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.group ?? ""} ${o.hint ?? ""}`.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(o: SearchOption) {
    onChange(o.value);
    setOpen(false);
  }

  function toggle() {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen((v) => !v);
  }

  return (
    <div ref={wrap} className="relative min-w-0">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} disabled={disabled} onClick={toggle} className={cn(FIELD, className, disabled && "opacity-50")}>
        <span className={cn("truncate", !picked && "text-muted-foreground")}>{picked ? picked.label : placeholder}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-full min-w-[240px] overflow-hidden rounded-lg border border-line/20 bg-card shadow-lg">
          <div className="relative border-b border-line/10">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(shown.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (shown[active]) choose(shown[active]);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
              placeholder="Search"
              aria-label="Search the list"
              className="h-10 w-full bg-transparent pl-9 pr-3 text-[14px] outline-none"
            />
          </div>
          <ul ref={list} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {shown.map((o, i) => (
              <li key={o.value || "__none"}>
                {o.group && o.group !== shown[i - 1]?.group && (
                  <div className="px-3 pb-0.5 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{o.group}</div>
                )}
                <button
                  type="button"
                  role="option"
                  data-index={i}
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-[14px]", i === active && "bg-secondary", o.value === value && "font-semibold")}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-[12px] text-muted-foreground">{o.hint}</span>}
                  {o.value === value && <Check className="h-4 w-4 shrink-0 text-cacao" />}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-2 text-[13px] text-muted-foreground">Nothing matches “{query.trim()}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
