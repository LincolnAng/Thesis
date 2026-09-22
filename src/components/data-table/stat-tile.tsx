import { Children, type CSSProperties, type ReactNode } from "react";
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

/**
 * A column count that fills rows evenly: every item in one row if they fit, otherwise the
 * largest count that divides them exactly (8 → 4+4), otherwise rows as balanced as
 * possible (7 → 4+3). Auto-fit alone packs greedily and strands a lone tile (8 → 7+1).
 */
export function evenColumns(count: number, max: number): number {
  if (count <= max) return Math.max(count, 1);
  for (let cols = max; cols >= 2; cols--) {
    if (count % cols === 0) return cols;
  }
  return Math.ceil(count / Math.ceil(count / max));
}

/** KPI row that always fills its rows evenly — see evenColumns. */
export function StatGrid({ children }: { children: ReactNode }) {
  const count = Children.toArray(children).length;
  const style = {
    "--cols": evenColumns(count, 6),
    "--cols-md": evenColumns(count, 4),
  } as CSSProperties;
  return (
    <div
      className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-[repeat(var(--cols-md),minmax(0,1fr))] min-[1024px]:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
      style={style}
    >
      {children}
    </div>
  );
}
