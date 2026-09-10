import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * An invitation, not a report of absence. "No events yet" tells someone what they already
 * know; "Add your first event" tells them what to do about it.
 */
export function EmptyState({
  icon: Icon,
  heading,
  body,
  action,
}: {
  icon: LucideIcon;
  heading: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-[var(--radius-panel)] border border-border bg-card px-6 py-8 text-center">
      <Icon className="h-12 w-12 text-muted-foreground/40" strokeWidth={1.5} />
      <div className="space-y-1">
        <p className="text-[16px] font-semibold text-foreground">{heading}</p>
        <p className="mx-auto max-w-[320px] text-[14px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  );
}
