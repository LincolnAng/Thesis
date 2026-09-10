import { cn } from "@/lib/utils";

export type StockLevel = "low" | "ok" | "good";

/**
 * Where a quantity sits relative to its own low-stock threshold. A threshold of 0 means the
 * owner never set one, so there's nothing to be low against and everything reads as fine.
 */
export function stockLevel(qty: number, threshold: number): StockLevel {
  if (threshold <= 0) return qty > 0 ? "good" : "low";
  if (qty <= threshold) return "low";
  if (qty <= threshold * 2) return "ok";
  return "good";
}

const LEVEL_FILLED: Record<StockLevel, number> = { low: 1, ok: 2, good: 3 };

/** Three segments instead of a sentence — the same "running low" signal, read at a glance. */
export function StockLevelBar({ level, className }: { level: StockLevel; className?: string }) {
  const filled = LEVEL_FILLED[level];
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={level === "low" ? "Running low" : level === "ok" ? "Getting low" : "Well stocked"}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-4 rounded-full",
            i < filled
              ? level === "low"
                ? "bg-[var(--status-warning)]"
                : level === "ok"
                  ? "bg-[var(--status-warning)]/60"
                  : "bg-[var(--status-good)]"
              : "bg-border",
          )}
        />
      ))}
    </span>
  );
}
