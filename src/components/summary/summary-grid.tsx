"use client";

import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type InlineSection = "sales" | "expenses" | "stock";

export interface GridItem {
  key: string;
  label: string;
  icon: LucideIcon;
  stat: string;
  statTone?: "warning" | "neutral";
  href?: string; // set for items that navigate to their own page
}

export function SummaryGrid({
  items,
  onSelect,
}: {
  items: GridItem[];
  onSelect: (section: InlineSection) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        const content = (
          <>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon className="h-6 w-6 text-foreground" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-foreground">{item.label}</span>
              <span
                className={cn(
                  "block truncate text-base",
                  item.statTone === "warning" ? "text-[var(--status-warning)]" : "text-muted-foreground",
                )}
              >
                {item.stat}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </>
        );
        const className =
          "flex w-full items-center gap-4 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:bg-accent";

        return item.href ? (
          <Link key={item.key} href={item.href} className={className}>
            {content}
          </Link>
        ) : (
          <button key={item.key} onClick={() => onSelect(item.key as InlineSection)} className={className}>
            {content}
          </button>
        );
      })}
    </div>
  );
}
