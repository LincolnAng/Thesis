"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { formatPeso } from "@/lib/format";
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

  const sorted = reaches
    .filter((r) => r.daysLeft !== null)
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));

  const selected = sorted.find((r) => r.material.id === selectedId) ?? null;
  const selectedAvgCost = selected
    ? weightedAverageUnitCost(procurementHistoryFor(entries, selected.material.name))
    : null;

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-border p-4">
        <p className="text-base text-muted-foreground">Not enough history yet to project ingredient reach.</p>
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
                {r.daysLeft} day{r.daysLeft === 1 ? "" : "s"} left
                {r.isEstimate ? " · estimate" : ""}
              </span>
            </span>
            <span className={cn("flex shrink-0 items-center gap-1 text-sm font-semibold", URGENCY_COLOR[r.urgency ?? "green"])}>
              {r.urgency === "red" && <AlertTriangle className="h-4 w-4" />}
              {URGENCY_WORD[r.urgency ?? "green"]}
            </span>
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
