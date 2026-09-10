"use client";

import { formatPeso } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Revenue − ingredient cost − other expenses = net profit, with the operators shown.
 *
 * Two tiles reading "Revenue ₱120" and "Net profit ₱75" side by side imply a subtraction
 * that isn't the real formula — the missing ₱45 was cost of goods, deducted silently. The
 * arithmetic here is checkable from what's on screen.
 */
export function ProfitWaterfall({
  revenue,
  cogs,
  expenses,
  netProfit,
  periodLabel,
}: {
  revenue: number;
  cogs: number;
  expenses: number;
  netProfit: number;
  periodLabel: string;
}) {
  const steps = [
    { label: "Revenue", value: revenue, tone: "good" as const, op: null },
    { label: "Ingredient cost", value: cogs, tone: "warning" as const, op: "−" },
    { label: "Other expenses", value: expenses, tone: "warning" as const, op: "−" },
    { label: "Net profit", value: netProfit, tone: netProfit >= 0 ? ("good" as const) : ("critical" as const), op: "=" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold text-muted-foreground">Where the money went · {periodLabel}</p>
      <div className="flex flex-wrap items-stretch gap-y-3">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center">
            {step.op && (
              <span
                aria-hidden
                className={cn(
                  "px-3 text-xl font-semibold text-muted-foreground",
                  step.op === "=" && "text-foreground",
                )}
              >
                {step.op}
              </span>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground">{step.label}</p>
              <p
                className={cn(
                  "text-xl font-bold",
                  step.tone === "good" && "text-[var(--status-good)]",
                  step.tone === "warning" && "text-[var(--status-warning)]",
                  step.tone === "critical" && "text-[var(--status-critical)]",
                )}
              >
                {formatPeso(step.value)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
