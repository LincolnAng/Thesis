"use client";

// Shared styling so every Advanced View chart reads as one system: same grid, axis,
// tooltip, and legend treatment. A legend/tooltip is mandatory on every multi-series
// chart here (never color-alone identity) — the brand's categorical palette
// (src/lib/chart-colors.ts) is intentionally muted and doesn't clear a strict
// chroma/contrast bar on its own, so labels always carry identity, color only reinforces it.

export const CHART_GRID_STROKE = "var(--border)";
export const CHART_AXIS_TICK = { fontSize: 12, fill: "var(--muted-foreground)" };
export const CHART_HEIGHT = "h-56";

interface TooltipPayloadEntry {
  dataKey?: string;
  name?: string;
  value?: number | string;
  color?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatValue = (v) => String(v),
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  formatValue?: (value: number | string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-sm">
      {label !== undefined && <p className="mb-1 font-medium text-foreground">{label}</p>}
      <div className="space-y-0.5">
        {payload.map((entry, i) => (
          <p key={entry.dataKey ?? i} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="font-medium text-foreground">{entry.name}:</span>{" "}
            {entry.value !== undefined ? formatValue(entry.value) : ""}
          </p>
        ))}
      </div>
    </div>
  );
}

export const CHART_LEGEND_STYLE = { fontSize: 12, color: "var(--muted-foreground)", paddingTop: 8 };
