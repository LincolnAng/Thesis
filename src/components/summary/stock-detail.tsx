"use client";
import { pluralize } from "@/lib/format";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { computeStockSummary } from "@/lib/summary/stock-summary";
import { computeIngredientReach } from "@/lib/summary/ingredient-reach";
import { stockMonthlyTrend } from "@/lib/summary/stock-trend";
import { MonthlyTrendChart } from "@/components/summary/monthly-trend-chart";
import { StockProducedSoldChart } from "@/components/summary/stock-produced-sold-chart";
import { StockCalendar } from "@/components/summary/stock-calendar";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/layout/action-card";
import { BatchPlannerButton } from "@/components/inventory/batch-planner";
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

  // 4.5 — Simple gets the status list and the action, not the trend charts. The
  // ingredient calendar is a chart in all but name and belongs to Advanced too.
  const analytics = viewMode === "advanced";

  return (
    <div className="space-y-6">
      {analytics && <MonthlyTrendChart data={trend} metric="stock" />}
      {analytics && <StockProducedSoldChart data={trend} />}

      {summary.mostUrgent && (
        <ActionCard
          icon={TriangleAlert}
          tone="warning"
          title={
            <>
              <span className="font-medium">{summary.mostUrgent.product.name}</span> is running low
              {summary.mostUrgent.runwayDays != null
                ? ` — about ${pluralize(summary.mostUrgent.runwayDays, "day")} left at your usual pace.`
                : ` — ${pluralize(summary.mostUrgent.product.stockQty, "jar")} left.`}
            </>
          }
          action={<BatchPlannerButton productId={summary.mostUrgent.product.id} />}
        />
      )}

      <div className="space-y-2">
        <h2 className="type-section-header text-muted-foreground">Ingredients and supplies</h2>
        {analytics && <StockCalendar reaches={reaches} entries={entries} />}
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
                    {pluralize(r.daysLeft ?? 0, "day")} left.
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
