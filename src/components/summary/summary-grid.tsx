"use client";

import Link from "next/link";
import { type LucideIcon } from "lucide-react";
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
    <div className="mx-auto grid w-full max-w-[520px] grid-cols-2 gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        const content = (
          <>
            <Icon className="h-6 w-6 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
            <span
              className={cn(
                "text-sm font-semibold",
                item.statTone === "warning" ? "text-[var(--status-warning)]" : "text-foreground",
              )}
            >
              {item.stat}
            </span>
          </>
        );
        const className =
          "flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-3 py-8 text-center transition-colors hover:bg-accent";

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
