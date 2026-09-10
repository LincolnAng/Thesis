"use client";

import { formatPeso } from "@/lib/format";
import type { ProductCostBreakdown } from "@/lib/summary/recipe-cost";
import { cn } from "@/lib/utils";

/**
 * The four lines that make up cost per jar, and their total.
 *
 * These are a decomposition, not additions: packaging and labor were always inside the
 * per-jar figure, folded into one "ingredients" number that hid ₱15 of jar and label behind
 * the word. Splitting them changes nothing about the total — it just makes it answerable.
 */
export function CostBreakdownLines({ cost }: { cost: ProductCostBreakdown }) {
  const lines = [
    { label: "Ingredients", value: cost.ingredientPerJar, hint: "what goes in the jar" },
    { label: "Packaging", value: cost.packagingPerJar, hint: "jar, label, lid" },
    {
      label: "Labor",
      value: cost.laborPerJar,
      hint: cost.laborIsOverride ? "entered by hand" : "time × hourly rate",
    },
    { label: "Other", value: cost.miscPerJar, hint: "electricity, gas" },
  ];

  return (
    <div className="space-y-1.5">
      {lines.map((line) => (
        <div key={line.label} className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {line.label}
            <span className="ml-1.5 text-xs text-muted-foreground/70">{line.hint}</span>
          </span>
          <span className={cn("font-medium", line.value > 0 ? "text-foreground" : "text-muted-foreground")}>
            {formatPeso(line.value)}
          </span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-2 border-t border-border pt-1.5 text-sm">
        <span className="font-semibold text-foreground">Total cost per jar</span>
        <span className="font-bold text-foreground">{formatPeso(cost.costPerJar)}</span>
      </div>
      {cost.laborPerJar === 0 && !cost.laborIsOverride && (
        <p className="text-xs text-[var(--status-warning)]">
          Labor is ₱0 — set an hourly rate in Settings and the minutes a batch takes, and it&apos;ll be counted here.
        </p>
      )}
      {cost.unconvertible.length > 0 && (
        <p className="text-xs text-[var(--status-warning)]">
          A supplier price for {cost.unconvertible.join(", ")} is logged in a unit that doesn&apos;t match how it&apos;s
          stocked, so the older stored cost is being used instead.
        </p>
      )}
    </div>
  );
}
