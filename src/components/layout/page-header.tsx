"use client";

import type { LucideIcon } from "lucide-react";
import { ViewModeToggle } from "@/components/summary/view-mode-toggle";

/**
 * Every page opens the same way: the icon it wears in the nav, its title, and the mode
 * switch directly beneath. Repeating the nav icon at size means clicking the box in the
 * sidebar lands you on a page wearing the same box — the two halves of the app agree on
 * what each section looks like.
 */
export function PageHeader({
  icon: Icon,
  title,
  meta,
}: {
  icon: LucideIcon;
  title: string;
  meta?: string;
}) {
  return (
    <header className="mb-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-pill)] bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </span>
        <h1 className="type-page-title min-w-0 flex-1 truncate-line text-foreground">{title}</h1>
        {meta && <p className="type-meta shrink-0">{meta}</p>}
      </div>
      <div className="mt-3">
        <ViewModeToggle />
      </div>
    </header>
  );
}
