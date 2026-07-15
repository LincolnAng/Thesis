import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "good" | "warning" | "neutral";

export interface BigRowListProps<T> {
  rows: T[];
  keyFor: (row: T) => string;
  title: (row: T) => string;
  subtitle?: (row: T) => string | null | undefined;
  trailing: (row: T) => string;
  trailingTone?: Tone | ((row: T) => Tone);
  icon?: LucideIcon;
  iconTone?: "good" | "warning";
  onSelect: (row: T) => void;
  emptyMessage: string;
}

/** A big, tappable row list — the Simple-view alternative to DataTable. Each row
 * opens an edit dialog on tap instead of exposing small inline icon buttons. */
export function BigRowList<T>({
  rows,
  keyFor,
  title,
  subtitle,
  trailing,
  trailingTone = "neutral",
  icon: Icon,
  iconTone = "good",
  onSelect,
  emptyMessage,
}: BigRowListProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-card">
      {rows.map((row) => {
        const sub = subtitle?.(row);
        const tone = typeof trailingTone === "function" ? trailingTone(row) : trailingTone;
        return (
          <button
            key={keyFor(row)}
            type="button"
            onClick={() => onSelect(row)}
            className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-accent"
          >
            {Icon && (
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  iconTone === "good" ? "bg-[var(--status-good)]/15" : "bg-[var(--status-warning)]/15",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    iconTone === "good" ? "text-[var(--status-good)]" : "text-[var(--status-warning)]",
                  )}
                />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium text-foreground">{title(row)}</span>
              {sub && <span className="block truncate text-sm text-muted-foreground">{sub}</span>}
            </span>
            <span
              className={cn(
                "shrink-0 text-base font-semibold",
                tone === "good" && "text-[var(--status-good)]",
                tone === "warning" && "text-[var(--status-warning)]",
                (tone === "neutral" || !tone) && "text-foreground",
              )}
            >
              {trailing(row)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
