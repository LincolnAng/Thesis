import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "warning" | "critical";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-4">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold",
          tone === "good" && "text-[var(--status-good)]",
          tone === "warning" && "text-[var(--status-warning)]",
          tone === "critical" && "text-[var(--status-critical)]",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
