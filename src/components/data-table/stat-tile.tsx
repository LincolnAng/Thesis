import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A compact KPI. Denser than it was (72px rather than 100px) so a KPI row and the first
 * chart row fit above the fold together, which is the difference between scanning the
 * business and scrolling through it.
 */
export function StatTile({
  label,
  value,
  sub,
  delta,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  /** A comparison against the previous period — the question is never "what is it". */
  delta?: ReactNode;
  tone?: "neutral" | "good" | "warning" | "critical";
}) {
  return (
    <div className="flex min-h-[72px] flex-col justify-center rounded-[var(--radius-panel)] border border-border bg-card px-3 py-3">
      <p className="type-stat-label truncate-line text-muted-foreground" title={label}>
        {label}
      </p>
      <div className="flex items-baseline gap-1.5">
        <p
          className={cn(
            "truncate-line text-[22px] font-bold leading-tight",
            tone === "good" && "text-[var(--status-good)]",
            tone === "warning" && "text-[var(--status-warning)]",
            tone === "critical" && "text-[var(--status-critical)]",
            tone === "neutral" && "text-foreground",
          )}
        >
          {value}
        </p>
        {delta}
      </div>
      {sub && <p className="truncate-line text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Auto-fitting KPI row — six to eight metrics without a breakpoint per count. */
export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
      {children}
    </div>
  );
}
