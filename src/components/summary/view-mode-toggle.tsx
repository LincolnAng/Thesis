"use client";

import { useViewMode, type ViewMode } from "@/lib/summary/view-mode";
import { cn } from "@/lib/utils";

const SEGMENTS: Array<{ value: ViewMode; label: string }> = [
  { value: "simple", label: "Simple" },
  { value: "advanced", label: "Advanced" },
];

/**
 * A two-segment pill, not a text link. This switch changes what the whole product is —
 * which pages show charts, how dense the tables are — so it shouldn't read like a
 * secondary preference tucked into a corner.
 */
export function ViewModeToggle() {
  const [mode, setMode] = useViewMode();

  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-pill)] bg-secondary p-1"
    >
      {SEGMENTS.map((segment) => {
        const active = mode === segment.value;
        return (
          <button
            key={segment.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setMode(segment.value)}
            className={cn(
              "rounded-[var(--radius-pill)] px-4 py-1 text-[13px] font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,.08)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
