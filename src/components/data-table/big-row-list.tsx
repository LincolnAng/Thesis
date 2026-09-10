import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";

type Tone = "good" | "warning" | "neutral";

export interface BigRowListProps<T> {
  rows: T[];
  keyFor: (row: T) => string;
  title: (row: T) => string;
  /** A plain string renders muted, as a footnote. Return a node instead to emphasize part
   * of it — a buyer's name carries as much weight as the item, and shouldn't read as fine print. */
  subtitle?: (row: T) => ReactNode;
  trailing: (row: T) => string;
  trailingTone?: Tone | ((row: T) => Tone);
  icon?: LucideIcon;
  /** Picks the icon per row — a lucide component is itself a function, so this can't be
   * folded into `icon` without the two becoming indistinguishable at runtime. */
  iconFor?: (row: T) => LucideIcon;
  iconTone?: "good" | "warning" | ((row: T) => "good" | "warning");
  onSelect: (row: T) => void;
  /** Shows a trash-can button on the right of each row that deletes without opening the edit dialog. */
  onDelete?: (row: T) => void;
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
  icon,
  iconFor,
  iconTone = "good",
  onSelect,
  onDelete,
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
        const Icon = iconFor ? iconFor(row) : icon;
        const itemTone = typeof iconTone === "function" ? iconTone(row) : iconTone;
        return (
          <div key={keyFor(row)} className="flex items-center transition-colors hover:bg-accent">
            <button
              type="button"
              onClick={() => onSelect(row)}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 text-left"
            >
              {Icon && (
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    itemTone === "good" ? "bg-[var(--status-good)]/15" : "bg-[var(--status-warning)]/15",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      itemTone === "good" ? "text-[var(--status-good)]" : "text-[var(--status-warning)]",
                    )}
                  />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium text-foreground">{title(row)}</span>
                {sub != null && sub !== "" && (
                  <span className="block truncate text-sm">
                    {typeof sub === "string" ? <span className="text-muted-foreground">{sub}</span> : sub}
                  </span>
                )}
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
            {onDelete && (
              <span className="pr-3">
                <ConfirmDeleteButton onConfirm={() => onDelete(row)} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
