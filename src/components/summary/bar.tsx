import { cn } from "@/lib/utils";

export function Bar({ pct, tone = "neutral" }: { pct: number; tone?: "neutral" | "good" | "warning" }) {
  const color =
    tone === "good" ? "bg-[var(--status-good)]" : tone === "warning" ? "bg-[var(--status-warning)]" : "bg-primary";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}
