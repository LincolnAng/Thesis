import { cn } from "@/lib/utils";

export function ComparisonBadge({
  pct,
  comparedToLabel,
  favorableWhen,
}: {
  pct: number | null;
  comparedToLabel: string;
  favorableWhen: "up" | "down";
}) {
  if (pct === null) return null;
  const rounded = Math.round(pct);
  const isUp = rounded >= 0;
  const favorable = favorableWhen === "up" ? isUp : !isUp;
  const sign = isUp ? "+" : "";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        favorable
          ? "bg-[var(--status-good)]/15 text-[var(--status-good)]"
          : "bg-[var(--status-warning)]/15 text-[var(--status-warning)]",
      )}
    >
      {sign}
      {rounded}% vs {comparedToLabel}
    </span>
  );
}
