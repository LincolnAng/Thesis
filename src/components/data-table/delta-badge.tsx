import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * How a number moved against the period before it. A power user's question is never
 * "what is it" — it's "is it moving, and which way".
 */
export function DeltaBadge({
  pct,
  comparedTo,
  favorableWhen = "up",
}: {
  pct: number | null;
  comparedTo: string;
  favorableWhen?: "up" | "down";
}) {
  if (pct == null || !Number.isFinite(pct)) return null;

  const flat = Math.abs(pct) < 0.5;
  const up = pct > 0;
  const favorable = flat ? null : (up && favorableWhen === "up") || (!up && favorableWhen === "down");
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium",
        favorable === null && "text-muted-foreground",
        favorable === true && "text-[var(--status-good)]",
        favorable === false && "text-[var(--status-warning)]",
      )}
      title={`vs ${comparedTo}`}
    >
      <Icon className="h-3 w-3" />
      {flat ? "flat" : `${Math.abs(Math.round(pct))}%`}
      <span className="text-muted-foreground"> vs {comparedTo}</span>
    </span>
  );
}
