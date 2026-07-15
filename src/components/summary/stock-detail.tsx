"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { computeStockSummary } from "@/lib/summary/stock-summary";
import { computeIngredientReach } from "@/lib/summary/ingredient-reach";
import { stockMonthlyTrend } from "@/lib/summary/stock-trend";
import { MonthlyTrendChart } from "@/components/summary/monthly-trend-chart";
import { StockProducedSoldChart } from "@/components/summary/stock-produced-sold-chart";
import { StockCalendar } from "@/components/summary/stock-calendar";
import { Button } from "@/components/ui/button";
import { useViewMode } from "@/lib/summary/view-mode";

export function StockDetail() {
  const { products, rawMaterials, entries } = useStore();
  const summary = useMemo(() => computeStockSummary(products, rawMaterials, entries), [products, rawMaterials, entries]);
  const trend = useMemo(() => stockMonthlyTrend(entries), [entries]);
  const [viewMode] = useViewMode();
  const reaches = useMemo(
    () => computeIngredientReach(rawMaterials, products, entries),
    [rawMaterials, products, entries],
  );
  const urgentReaches = reaches.filter((r) => r.urgency === "red");

  return (
    <div className="space-y-6">
      <MonthlyTrendChart data={trend} metric="stock" />
      {viewMode === "advanced" && <StockProducedSoldChart data={trend} />}

      {summary.mostUrgent && (
        <div className="space-y-3 rounded-2xl border border-[var(--status-warning)] bg-amber-50 px-4 py-3.5 dark:bg-amber-950/30">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-warning)]" />
            <p className="text-sm text-foreground">
              {summary.mostUrgent.product.name} is running low
              {summary.mostUrgent.runwayDays != null
                ? ` — about ${summary.mostUrgent.runwayDays} day${summary.mostUrgent.runwayDays === 1 ? "" : "s"} left at your usual pace.`
                : ` — ${summary.mostUrgent.product.stockQty} jars left.`}
            </p>
          </div>
          <Link href={`/chat?draft=${encodeURIComponent(`Made a batch of ${summary.mostUrgent.product.name}`)}`}>
            <Button size="sm" variant="secondary">
              Plan a batch
            </Button>
          </Link>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Ingredients and supplies</h2>
        <StockCalendar reaches={reaches} entries={entries} />
        {urgentReaches.length > 0 && (
          <div className="space-y-2">
            {urgentReaches.map((r) => (
              <div
                key={r.material.id}
                className="space-y-2.5 rounded-2xl border border-[var(--status-critical)] bg-red-50 px-4 py-3.5 dark:bg-red-950/30"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-critical)]" />
                  <p className="text-sm text-foreground">
                    {r.material.name} will run out on{" "}
                    {r.runOutDate!.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} —{" "}
                    {r.daysLeft} day{r.daysLeft === 1 ? "" : "s"} left.
                  </p>
                </div>
                <Link href="/suppliers">
                  <Button size="sm" variant="secondary">
                    Order now?
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
