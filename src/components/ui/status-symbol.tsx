import { CircleAlert, CircleCheck, TrendingUp, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One fixed pairing of meaning to symbol and color, used everywhere a status appears —
 * stock rows, supplier price moves, budget, product levels.
 *
 * A beginner should be able to pick out the rows that need attention without reading a
 * word, which only works if orange always means the same thing on every screen.
 */
export type StatusKind = "good" | "watch" | "critical" | "info";

const SYMBOLS: Record<StatusKind, { icon: LucideIcon; color: string; label: string }> = {
  good: { icon: CircleCheck, color: "var(--status-good)", label: "On track" },
  watch: { icon: TriangleAlert, color: "var(--status-warning)", label: "Running low" },
  critical: { icon: CircleAlert, color: "var(--status-critical)", label: "Out" },
  info: { icon: TrendingUp, color: "var(--status-info)", label: "Changed" },
};

export function statusColor(kind: StatusKind): string {
  return SYMBOLS[kind].color;
}

export function StatusSymbol({ kind, className }: { kind: StatusKind; className?: string }) {
  const { icon: Icon, label } = SYMBOLS[kind];
  return (
    <Icon
      className={cn("h-4 w-4 shrink-0", className)}
      style={{ color: SYMBOLS[kind].color }}
      aria-label={label}
    />
  );
}

/** The informational variant reads as a chip rather than a bare icon — a price rising isn't
 * a problem to fix, it's a fact to notice. */
export function StatusChip({ kind, children }: { kind: StatusKind; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-[12px] font-medium"
      style={{ color: SYMBOLS[kind].color, backgroundColor: `color-mix(in oklch, ${SYMBOLS[kind].color} 12%, transparent)` }}
    >
      <StatusSymbol kind={kind} className="h-3 w-3" />
      {children}
    </span>
  );
}
