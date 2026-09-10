"use client";

import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GridItem {
  key: string;
  label: string;
  icon: LucideIcon;
  stat: string;
  statTone?: "warning" | "neutral";
  href: string;
}

export function SummaryGrid({ items }: { items: GridItem[] }) {
  return (
    <div className="grid w-full grid-cols-2 gap-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        const content = (
          <>
            <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-pill)] bg-muted">
              <Icon className="h-5 w-5 text-foreground" />
            </span>
            <span className="min-w-0">
              <span className="type-section-header block truncate-line text-foreground">{item.label}</span>
              <span
                className={cn(
                  "type-meta block truncate-line",
                  item.statTone === "warning" && "text-[var(--status-warning)]",
                )}
              >
                {item.stat}
              </span>
            </span>
          </>
        );
        // The last tile of an odd-numbered set spans both columns rather than sitting
        // orphaned in the left half of its own row.
        const spansRow = items.length % 2 === 1 && index === items.length - 1;
        const className = cn(
          "flex min-h-[120px] w-full flex-col justify-center gap-2 rounded-[var(--radius-panel)] border border-border bg-card p-4 text-left transition-colors hover:bg-accent",
          spansRow && "col-span-2",
        );

        return (
          <Link key={item.key} href={item.href} className={className}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}
