"use client";

import { useMemo } from "react";
import { CalendarDays, CircleAlert, CircleCheck } from "lucide-react";
import { MachinesPanel } from "@/components/scheduling/machines-panel";
import { ItemIcon } from "@/lib/summary/item-icons";
import { useStore } from "@/lib/store/use-store";
import { pluralize } from "@/lib/format";
import { buildProductionPlan } from "@/lib/summary/schedule";
import { useViewMode } from "@/lib/summary/view-mode";
import { cn } from "@/lib/utils";

export default function SchedulingPage() {
  const { products, entries, machines, rawMaterials } = useStore();
  const [viewMode] = useViewMode();

  const plan = useMemo(
    () => buildProductionPlan(products, entries, machines, rawMaterials),
    [products, entries, machines, rawMaterials],
  );

  const toMake = plan.requirements.filter((r) => r.neededJars > 0);
  const shortIngredients = plan.ingredientNeeds.filter((i) => i.short > 0);
  const hasMachines = machines.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-foreground">Scheduling</h1>
        <p className="text-sm text-muted-foreground">for {plan.targetMonthLabel}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        What to make in the days left this month so there&apos;s enough stock for {plan.targetMonthLabel}, based on
        what sold in past months and how much the equipment can finish in a day.
      </p>

      <MachinesPanel machines={machines} />

      {hasMachines && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-2xl border p-4",
            plan.feasible
              ? "border-[var(--status-good)]/30 bg-[var(--status-good)]/5"
              : "border-[var(--status-warning)]/30 bg-[var(--status-warning)]/5",
          )}
        >
          {plan.feasible ? (
            <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-good)]" />
          ) : (
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-warning)]" />
          )}
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {plan.totalBatchesNeeded === 0
                ? "Nothing needs making — stock already covers what's expected."
                : plan.feasible
                  ? `All ${plan.totalBatchesNeeded} batches fit in the days left.`
                  : `Short by ${plan.shortfallBatches} of ${plan.totalBatchesNeeded} batches.`}
            </p>
            <p className="text-xs text-muted-foreground">
              {plan.workingDayCount} working days left this month · room for {plan.capacityBatches} batches
              {!plan.feasible && " · add a run day, or start with what's most urgent below"}
            </p>
          </div>
        </div>
      )}

      {toMake.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">What to make</h2>
          <ul className="divide-y divide-border">
            {toMake.map((r) => (
              <li key={r.productId} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <ItemIcon name={r.productName} className="h-4 w-4 text-secondary-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{r.productName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Expect {r.forecastQty} · have {r.currentStock}
                    {r.missingYield && " · set jars per batch on this product first"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-semibold text-foreground">{pluralize(r.neededJars, "jar")}</span>
                  <span
                    className={cn(
                      "block text-xs",
                      r.batchesScheduled < r.batchesNeeded
                        ? "text-[var(--status-warning)]"
                        : "text-muted-foreground",
                    )}
                  >
                    {r.batchesScheduled} of {r.batchesNeeded} batches planned
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.days.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Day by day</h2>
          </div>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {plan.days.map((day) => (
              <li key={day.date} className="flex items-start gap-3 px-4 py-3">
                <span className="w-24 shrink-0 text-sm font-medium text-foreground">{day.weekdayLabel}</span>
                <span className="min-w-0 flex-1 space-y-0.5">
                  {day.runs.map((run, i) => (
                    <span key={`${run.machineId}-${run.productId}-${i}`} className="block text-sm text-foreground">
                      {run.productName}{" "}
                      <span className="text-muted-foreground">
                        ×{pluralize(run.batches, "batch", "batches")}
                        {run.jars > 0 && ` (${pluralize(run.jars, "jar")})`} · {run.machineName}
                      </span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {viewMode === "advanced" && plan.ingredientNeeds.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Ingredients this plan uses</h2>
          <ul className="divide-y divide-border">
            {plan.ingredientNeeds.map((need) => (
              <li key={need.materialId} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <ItemIcon name={need.name} className="h-4 w-4 text-secondary-foreground" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{need.name}</span>
                <span className="shrink-0 text-right text-sm">
                  <span className="block text-foreground">
                    {need.required} {need.unit} needed
                  </span>
                  <span
                    className={cn(
                      "block text-xs",
                      need.short > 0 ? "text-[var(--status-warning)]" : "text-muted-foreground",
                    )}
                  >
                    {need.short > 0 ? `${need.short} ${need.unit} short` : `${need.onHand} ${need.unit} on hand`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {shortIngredients.length > 0 && (
            <p className="text-xs text-[var(--status-warning)]">
              Buy the short ingredients before starting, or the plan stalls partway through.
            </p>
          )}
        </section>
      )}

      {plan.totalBatchesNeeded === 0 && plan.days.length === 0 && (
        <p className="rounded-2xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing needs making yet — what&apos;s on the shelf already covers the demand expected for{" "}
          {plan.targetMonthLabel}. This fills in with a day-by-day plan as soon as sales outpace stock.
        </p>
      )}
    </div>
  );
}
