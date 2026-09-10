import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Three container types, so that not everything is a bordered card.
 *
 * When every block on a page has the same border and radius, nothing reads as more
 * important than anything else. A KPI is bare, records live in a bordered panel, and
 * charts sit on a tinted one so trend content is distinguishable from record content
 * at a glance.
 */

/** A headline number. No border, no fill — the number is the content. */
export function StatFlat({
  label,
  value,
  delta,
  tone = "neutral",
  className,
}: {
  label: string;
  value: string;
  delta?: ReactNode;
  tone?: "neutral" | "good" | "warning" | "critical";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="type-stat-label truncate-line text-muted-foreground">{label}</p>
      <p
        className={cn(
          "type-stat-number truncate-line",
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
  );
}

/** Lists, forms, records, empty states. */
export function Panel({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <section
      className={cn("rounded-[var(--radius-panel)] border border-border bg-card p-5", className)}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="type-section-header truncate-line text-foreground">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Trend content. Same border as a panel, tinted fill so it reads as a different kind of thing. */
export function ChartPanel({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-panel)] border border-border bg-[color-mix(in_oklch,var(--card)_92%,var(--muted))] p-6",
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="type-section-header truncate-line text-foreground">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Advanced-view chart grid: two up, one below 1024px. */
export function ChartGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-6 min-[1024px]:grid-cols-2">{children}</div>;
}
