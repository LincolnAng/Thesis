import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one thing to do on this page, stated in a sentence.
 *
 * Simple view's job is "what do I do now" — so each page leads with a single action rather
 * than a wall of numbers the owner has to interpret before deciding anything.
 */
export function ActionCard({
  icon: Icon,
  visual,
  title,
  action,
  tone = "neutral",
}: {
  icon?: LucideIcon;
  /** Replaces the icon with something shape-based — a progress ring, say. */
  visual?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "warning";
}) {
  return (
    <section
      className={cn(
        "flex min-h-[80px] items-center gap-4 rounded-[var(--radius-panel)] border p-4",
        tone === "warning"
          ? "border-[var(--status-warning)]/40 bg-[var(--status-warning)]/5"
          : "border-border bg-card",
      )}
    >
      {visual ??
        (Icon && (
          <Icon
            className="h-8 w-8 shrink-0"
            style={{ color: tone === "warning" ? "var(--status-warning)" : "var(--primary)" }}
          />
        ))}
      <div className="min-w-0 flex-1">
        <p className="type-body text-foreground">{title}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </section>
  );
}
