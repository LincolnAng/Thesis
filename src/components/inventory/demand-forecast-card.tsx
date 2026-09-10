"use client";

import { TrendingUp } from "lucide-react";
import { ItemIcon } from "@/lib/summary/item-icons";
import { FORECAST_METHOD_LABELS, type ProductForecast } from "@/lib/summary/forecast";
import { cn } from "@/lib/utils";

/**
 * Next month's expected demand per product, and the gap between that and what's on the
 * shelf. Every row states what it was worked out from — a forecast off one month of sales
 * shouldn't look as solid as one off a year, and hiding that invites over-production.
 */
export function DemandForecastCard({
  forecasts,
  monthLabel,
  compact = false,
}: {
  forecasts: ProductForecast[];
  monthLabel: string;
  compact?: boolean;
}) {
  const withHistory = forecasts.filter((f) => f.monthsOfHistory > 0);
  const totalToMake = forecasts.reduce((sum, f) => sum + f.suggestedProduction, 0);

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Expected demand for {monthLabel}</h2>
      </div>

      {withHistory.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Not enough sales history yet. Once a full month of sales is logged, this works out how much to
          prepare for the month ahead.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {forecasts.map((f) => (
              <li key={f.productId} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <ItemIcon name={f.productName} className="h-4 w-4 text-secondary-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{f.productName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {f.monthsOfHistory > 0
                      ? `Expect ${f.forecastQty} · have ${f.currentStock}`
                      : "No sales history yet"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className={cn(
                      "block text-base font-semibold",
                      f.monthsOfHistory === 0
                        ? "text-muted-foreground"
                        : f.suggestedProduction > 0
                          ? "text-[var(--status-warning)]"
                          : "text-[var(--status-good)]",
                    )}
                  >
                    {f.monthsOfHistory === 0
                      ? "—"
                      : f.suggestedProduction > 0
                        ? `Make ${f.suggestedProduction}`
                        : "Covered"}
                  </span>
                  {!compact && f.monthsOfHistory > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      {FORECAST_METHOD_LABELS[f.method]}
                      {f.confidence === "low" && " · rough"}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {totalToMake > 0
              ? `About ${totalToMake} jars to prepare in total. Based on sales up to last month — this month isn't counted yet since it's still going.`
              : "Current stock already covers what's expected."}
          </p>
        </>
      )}
    </section>
  );
}
