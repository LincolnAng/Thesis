"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartPanel } from "@/components/layout/containers";
import { CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_Y_WIDTH, ChartTooltip } from "@/components/summary/chart-theme";
import { stockLevel } from "@/components/data-table/stock-level";
import { formatNumber } from "@/lib/format";
import { MOVING_AVERAGE_MONTHS, type ProductForecast } from "@/lib/summary/forecast";
import { cacaoUtilizationPct, setCacaoUtilizationPct } from "@/lib/summary/business-config";
import { isRawCacao } from "@/lib/summary/cacao";
import { useStore } from "@/lib/store/use-store";
import { cn } from "@/lib/utils";

export interface ProductBar {
  productId: string;
  name: string;
  color: string;
  onHand: number;
  forecast: number;
}

function JarsChart({
  data,
  dataKey,
  domainMax,
  label,
  onSelect,
}: {
  data: ProductBar[];
  dataKey: "onHand" | "forecast";
  domainMax: number;
  label: string;
  onSelect?: (productId: string) => void;
}) {
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
          <XAxis dataKey="name" tick={CHART_AXIS_TICK} axisLine={{ stroke: CHART_GRID_STROKE }} tickLine={false} interval={0} />
          <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={CHART_Y_WIDTH} domain={[0, domainMax]} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={<ChartTooltip formatValue={(v) => `${formatNumber(Number(v))} jars`} />}
          />
          <Bar
            dataKey={dataKey}
            name={label}
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
            className={onSelect ? "cursor-pointer" : undefined}
            onClick={onSelect ? (d) => onSelect((d as unknown as ProductBar).productId) : undefined}
          >
            {data.map((d) => (
              <Cell key={d.productId} fill={d.color} />
            ))}
            <LabelList dataKey={dataKey} position="top" style={{ fontSize: 12, fontWeight: 600, fill: "var(--foreground)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Raw-material amounts as one quiet line, and the cacao utilization rate as one small slider. */
function RawMaterialsLine() {
  const { rawMaterials, businessSettings } = useStore();
  const utilization = cacaoUtilizationPct(businessSettings);
  const hasCacao = rawMaterials.some((m) => isRawCacao(m.name));

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
      {rawMaterials.length > 0 && (
        <p className="leading-relaxed">
          <span className="font-medium text-foreground">Raw materials: </span>
          {rawMaterials.map((m, i) => (
            <span key={m.id}>
              {i > 0 && " · "}
              {m.name}{" "}
              <span
                className={cn(
                  "font-semibold",
                  stockLevel(m.qty, m.lowStockThreshold) === "low" ? "text-[var(--status-warning)]" : "text-foreground",
                )}
              >
                {formatNumber(m.qty)} {m.unit}
              </span>
            </span>
          ))}
        </p>
      )}
      {hasCacao && (
        <label className="flex items-center gap-2 whitespace-nowrap">
          Cacao utilization
          <input
            type="range"
            min={30}
            max={100}
            value={utilization}
            onChange={(e) => setCacaoUtilizationPct(Number(e.target.value))}
            className="h-1 w-32 accent-[var(--primary)]"
            aria-label="Cacao utilization rate"
          />
          <span className="w-9 font-semibold text-foreground">{utilization}%</span>
          <span className="hidden truncate min-[1280px]:inline">usable after roasting &amp; shelling</span>
        </label>
      )}
    </div>
  );
}

/**
 * What's on the shelf now next to what next month is expected to sell, on the same scale, so
 * the gap between each pair is what the eye lands on — that gap is what the production plan
 * below has to fill.
 */
export function StockForecastCharts({
  data,
  forecasts,
  monthLabel,
  onSelectProduct,
}: {
  data: ProductBar[];
  forecasts: ProductForecast[];
  monthLabel: string;
  onSelectProduct: (productId: string) => void;
}) {
  const domainMax = Math.max(10, ...data.flatMap((d) => [d.onHand, d.forecast]));
  const roundedMax = Math.ceil((domainMax * 1.15) / 10) * 10;
  const lowHistory = forecasts.filter((f) => f.method !== "moving_average");

  return (
    <div className="grid gap-6 min-[1024px]:grid-cols-2">
      <ChartPanel title="Current inventory" action={<span className="type-meta text-muted-foreground">jars on hand · tap a bar to edit</span>}>
        <JarsChart data={data} dataKey="onHand" domainMax={roundedMax} label="On hand" onSelect={onSelectProduct} />
        <RawMaterialsLine />
      </ChartPanel>
      <ChartPanel
        title={`Forecast demand · ${monthLabel}`}
        action={<span className="type-meta text-muted-foreground">{MOVING_AVERAGE_MONTHS}-month moving average of sales</span>}
      >
        <JarsChart data={data} dataKey="forecast" domainMax={roundedMax} label="Expected to sell" />
        {lowHistory.length > 0 && (
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            Less than {MOVING_AVERAGE_MONTHS} months of sales yet for {lowHistory.map((f) => f.productName).join(", ")} — the
            forecast firms up as more months are logged.
          </p>
        )}
      </ChartPanel>
    </div>
  );
}
