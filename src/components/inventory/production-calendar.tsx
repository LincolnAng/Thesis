"use client";

import { Flag } from "lucide-react";
import type { PlanDay } from "@/lib/summary/production-schedule";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthsIn(days: PlanDay[]): { key: string; label: string; days: PlanDay[] }[] {
  const groups = new Map<string, PlanDay[]>();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const [y, m] = key.split("-").map(Number);
    return {
      key,
      label: new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      days: list,
    };
  });
}

/** Monday-first column of a date. */
function column(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

function MonthGrid({
  label,
  days,
  today,
  colorOf,
  onToggleDay,
}: {
  label: string;
  days: PlanDay[];
  today: string;
  colorOf: (productId: string) => string;
  onToggleDay: (date: string) => void;
}) {
  const lead = days.length > 0 ? column(days[0].date) : 0;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((day) => {
          const dayNumber = Number(day.date.slice(8));
          const clickable = day.status !== "past";
          const title =
            day.status === "past"
              ? "Already passed"
              : day.status === "unavailable"
                ? "Marked unavailable — click to make available"
                : day.status === "no_equipment"
                  ? "No equipment runs this day — click to mark unavailable"
                  : `${day.capacity} batch capacity — click to mark unavailable`;
          return (
            <button
              key={day.date}
              type="button"
              disabled={!clickable}
              onClick={() => onToggleDay(day.date)}
              title={title}
              className={cn(
                "flex min-h-[84px] flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors",
                day.status === "past" && "cursor-default border-transparent bg-muted/40 opacity-50",
                day.status === "unavailable" &&
                  "border-dashed border-border bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,transparent_6px_12px)]",
                day.status === "no_equipment" && "border-border bg-card/50",
                day.status === "open" && "border-border bg-card hover:bg-accent",
                day.date === today && "ring-2 ring-primary",
              )}
            >
              <span className="flex items-center justify-between">
                <span className={cn("text-xs font-semibold", day.status === "open" ? "text-foreground" : "text-muted-foreground")}>
                  {dayNumber}
                </span>
                {day.status === "unavailable" && <span className="text-[10px] font-medium text-muted-foreground">Off</span>}
              </span>
              {day.eventNames.map((name) => (
                <span key={name} className="flex items-center gap-1 truncate text-[10px] font-medium text-foreground">
                  <Flag className="h-3 w-3 shrink-0 text-[var(--status-info)]" />
                  <span className="truncate">{name}</span>
                </span>
              ))}
              {day.runs.map((run) => (
                <span
                  key={run.productId}
                  className="flex items-center gap-1 truncate rounded-[4px] px-1 py-0.5 text-[10px] font-medium text-foreground"
                  style={{ backgroundColor: `color-mix(in oklch, ${colorOf(run.productId)} 22%, transparent)` }}
                  title={`${run.productName}: ${run.batches} batch${run.batches === 1 ? "" : "es"}${run.jars ? ` (${run.jars} jars)` : ""}`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(run.productId) }} />
                  <span className="truncate">
                    {run.productName} ×{run.batches}
                  </span>
                </span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProductionCalendar({
  days,
  today,
  colorOf,
  onToggleDay,
}: {
  days: PlanDay[];
  today: string;
  colorOf: (productId: string) => string;
  onToggleDay: (date: string) => void;
}) {
  return (
    <div className="grid gap-6 min-[1024px]:grid-cols-2">
      {monthsIn(days).map((m) => (
        <MonthGrid key={m.key} label={m.label} days={m.days} today={today} colorOf={colorOf} onToggleDay={onToggleDay} />
      ))}
    </div>
  );
}
