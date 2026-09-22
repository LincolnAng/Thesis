"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { formatNumber, formatPeso, pluralize } from "@/lib/format";
import type { IngredientReach } from "@/lib/summary/ingredient-reach";
import { procurementHistoryFor, weightedAverageUnitCost } from "@/lib/summary/procurement";
import type { Entry } from "@/lib/store/types";
import { cn } from "@/lib/utils";

const URGENCY_WORD: Record<string, string> = {
  red: "Urgent",
  amber: "Order soon",
  green: "OK for now",
};

const URGENCY_COLOR: Record<string, string> = {
  red: "text-[var(--status-critical)]",
  amber: "text-[var(--status-warning)]",
  green: "text-[var(--status-good)]",
};

export function StockCalendar({ reaches, entries }: { reaches: IngredientReach[]; entries: Entry[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = [...reaches].sort((a, b) => {
    if (a.belowReorderPoint !== b.belowReorderPoint) return a.belowReorderPoint ? -1 : 1;
    return (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity);
  });

  const selected = sorted.find((r) => r.material.id === selectedId) ?? null;
  const selectedAvgCost = selected
    ? weightedAverageUnitCost(procurementHistoryFor(entries, selected.material.name))
    : null;

  if (sorted.length === 0) {
    return (
      <div className="rounded-[var(--radius-panel)] border border-border p-4">
        <p className="text-base text-muted-foreground">No ingredients tracked yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border p-2">
      <div className="divide-y divide-border">
        {sorted.map((r) => (
          <button
            key={r.material.id}
            type="button"
            onClick={() => setSelectedId((id) => (id === r.material.id ? null : r.material.id))}
            className="flex w-full items-center gap-3 px-2 py-3 text-left"
          >
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium text-foreground">{r.material.name}</span>
              <span className="block text-sm text-muted-foreground">
                {r.insufficientHistory ? (
                  r.material.reorderPoint
                    ? `${formatNumber(r.material.qty)} ${r.material.unit} on hand · restock at ${formatNumber(r.material.reorderPoint)}`
                    : "Not enough sales history to estimate — set a reorder point instead"
                ) : (
                  <>
                    {r.capped ? "90+ days" : pluralize(r.daysLeft ?? 0, "day")} left
                    {r.isEstimate ? " · estimate" : ""}
                  </>
                )}
              </span>
            </span>
            {r.insufficientHistory && !r.belowReorderPoint ? (
              <span className="shrink-0 text-sm text-muted-foreground">—</span>
            ) : (
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 text-sm font-semibold",
                  URGENCY_COLOR[r.urgency ?? "green"],
                )}
              >
                {r.urgency === "red" && <AlertTriangle className="h-4 w-4" />}
                {r.belowReorderPoint ? "Restock" : URGENCY_WORD[r.urgency ?? "green"]}
              </span>
            )}
          </button>
        ))}
      </div>

      {selected && selected.daysLeft !== null && (
        <div className="space-y-1 rounded-xl bg-muted px-3 py-2.5 text-sm">
          <span className="block font-medium text-foreground">
            {selected.material.name} · {selected.material.qty} {selected.material.unit} left
          </span>
          {selectedAvgCost != null && (
            <p className="text-muted-foreground">
              Average cost: {formatPeso(selectedAvgCost)} per {selected.material.unit}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
