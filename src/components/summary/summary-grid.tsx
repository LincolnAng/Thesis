"use client";

import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
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
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon;
        const content = (
          <>
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon className="h-8 w-8 text-foreground" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-semibold text-foreground">{item.label}</span>
              <span
                className={cn(
                  "block truncate text-base",
                  item.statTone === "warning" ? "text-[var(--status-warning)]" : "text-muted-foreground",
                )}
              >
                {item.stat}
              </span>
            </span>
            <ChevronRight className="h-6 w-6 shrink-0 text-muted-foreground" />
          </>
        );
        const className =
          "flex w-full items-center gap-4 rounded-2xl border border-border bg-card px-5 py-6 text-left transition-colors hover:bg-accent";

        return (
          <Link key={item.key} href={item.href} className={className}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}
