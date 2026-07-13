"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { formatDateShort, formatPeso } from "@/lib/format";
import type { IngredientReach } from "@/lib/summary/ingredient-reach";
import { procurementHistoryFor, weightedAverageUnitCost } from "@/lib/summary/procurement";
import { updateRawMaterial } from "@/lib/store/store";
import type { Entry } from "@/lib/store/types";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const URGENCY_WORD: Record<string, string> = {
  red: "urgent",
  amber: "order soon",
  green: "ok for now",
};
const MAX_LANES = 5;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

interface Segment {
  materialId: string;
  color: string;
  laneIdx: number;
  startCol: number;
  endCol: number;
  roundedStart: boolean;
  roundedEnd: boolean;
}

export function StockCalendar({ reaches, entries }: { reaches: IngredientReach[]; entries: Entry[] }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const viewMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const gridStart = new Date(year, month, 1 - startWeekday);
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const days = Array.from(
    { length: totalCells },
    (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i),
  );
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const reachable = reaches.filter((r) => r.runOutDate !== null).slice(0, MAX_LANES);
  const laneOf = new Map(reachable.map((r, i) => [r.material.id, i]));
  const selected = reaches.find((r) => r.material.id === selectedId) ?? null;
  const selectedAvgCost = useMemo(() => {
    if (!selected) return null;
    return weightedAverageUnitCost(procurementHistoryFor(entries, selected.material.name));
  }, [selected, entries]);

  return (
    <div className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMonthOffset((o) => o - 1)}
          aria-label="Previous month"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-foreground">
          {viewMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}
        </p>
        <button
          onClick={() => setMonthOffset((o) => o + 1)}
          aria-label="Next month"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Each ingredient has its own color. A line shows how many days are left, starting today, and its
        run-out day is circled in that color — split circles mean more than one ingredient runs out that
        day. The word next to each line (below) says how urgent that is.
      </p>

      <div className="grid grid-cols-7 text-center text-[10px] font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="space-y-1.5">
        {weeks.map((week, wi) => {
          const weekStart = week[0];
          const weekEnd = week[6];

          const segments: Segment[] = [];
          for (const r of reachable) {
            const runOut = r.runOutDate!;
            if (runOut < weekStart || today > weekEnd) continue;
            const clipStart = today > weekStart ? today : weekStart;
            const clipEnd = runOut < weekEnd ? runOut : weekEnd;
            if (clipEnd < clipStart) continue;
            segments.push({
              materialId: r.material.id,
              color: r.color,
              laneIdx: laneOf.get(r.material.id)!,
              startCol: dayDiff(clipStart, weekStart) + 1,
              endCol: dayDiff(clipEnd, weekStart) + 1,
              roundedStart: sameDay(clipStart, today),
              roundedEnd: sameDay(clipEnd, runOut),
            });
          }

          return (
            <div
              key={wi}
              className="grid grid-cols-7 gap-x-0"
              style={{ gridTemplateRows: `20px repeat(${MAX_LANES}, 4px)`, rowGap: "3px" }}
            >
              {week.map((d, di) => {
                const inMonth = d.getMonth() === month;
                const runoutToday = reachable.filter((r) => r.runOutDate && sameDay(r.runOutDate, d));
                const background =
                  runoutToday.length === 1
                    ? runoutToday[0].color
                    : runoutToday.length > 1
                      ? `conic-gradient(${runoutToday
                          .map(
                            (r, i) =>
                              `${r.color} ${(i / runoutToday.length) * 100}% ${((i + 1) / runoutToday.length) * 100}%`,
                          )
                          .join(", ")})`
                      : undefined;
                return (
                  <button
                    key={di}
                    type="button"
                    disabled={runoutToday.length === 0}
                    onClick={() => runoutToday.length > 0 && setSelectedId(runoutToday[0].material.id)}
                    style={{ gridColumn: di + 1, gridRow: 1 }}
                    className="flex items-center justify-center"
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                        runoutToday.length > 0 ? "font-bold" : !inMonth ? "text-muted-foreground/30" : "text-foreground",
                      )}
                      style={runoutToday.length > 0 ? { background, color: "var(--primary-foreground)" } : undefined}
                    >
                      {d.getDate()}
                    </span>
                  </button>
                );
              })}
              {segments.map((seg) => (
                <button
                  key={seg.materialId}
                  type="button"
                  onClick={() => setSelectedId(seg.materialId)}
                  style={{
                    gridColumn: `${seg.startCol} / ${seg.endCol + 1}`,
                    gridRow: 2 + seg.laneIdx,
                    backgroundColor: seg.color,
                    opacity: 0.75,
                  }}
                  className={cn(
                    "h-1",
                    seg.roundedStart ? "rounded-l-full" : "rounded-l-none",
                    seg.roundedEnd ? "rounded-r-full" : "rounded-r-none",
                  )}
                />
              ))}
            </div>
          );
        })}
      </div>

      {selected && selected.runOutDate && selected.daysLeft !== null && (
        <div className="space-y-1 rounded-xl bg-muted px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">
              {selected.material.name} · {selected.material.qty} {selected.material.unit} left
            </span>
            <span className="text-muted-foreground">
              {selected.daysLeft} day{selected.daysLeft === 1 ? "" : "s"} left
            </span>
          </div>
          {selectedAvgCost != null && (
            <p className="text-muted-foreground">
              Average cost: {formatPeso(selectedAvgCost)} per {selected.material.unit}
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5 border-t border-border pt-2.5">
        {reachable.length === 0 ? (
          <p className="text-xs text-muted-foreground">Not enough history yet to project ingredient reach.</p>
        ) : (
          <>
            {reachable.map((r) => (
              <div key={r.material.id} className="flex items-center gap-2 text-xs">
                <label
                  className="relative h-3.5 w-3.5 shrink-0 cursor-pointer rounded-full ring-1 ring-border"
                  style={{ backgroundColor: r.color }}
                  title="Tap to change this line's color"
                >
                  <input
                    type="color"
                    value={r.color}
                    onChange={(e) => updateRawMaterial(r.material.id, { color: e.target.value })}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.material.id)}
                  className="flex flex-1 items-center gap-1 text-left text-muted-foreground"
                >
                  {r.urgency === "red" && <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--status-critical)]" />}
                  <span>
                    {r.material.name} → {formatDateShort(r.runOutDate!.toISOString())}
                    {r.urgency && ` (${URGENCY_WORD[r.urgency]})`}
                    {r.isEstimate ? " · estimate" : ""}
                  </span>
                </button>
                {r.material.color && (
                  <button
                    type="button"
                    onClick={() => updateRawMaterial(r.material.id, { color: null })}
                    aria-label={`Reset ${r.material.name} color`}
                    className="shrink-0 text-muted-foreground/60 hover:text-foreground"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            <p className="pt-0.5 text-[11px] text-muted-foreground/70">Tap a colored dot to change that line&apos;s color.</p>
          </>
        )}
      </div>
    </div>
  );
}
