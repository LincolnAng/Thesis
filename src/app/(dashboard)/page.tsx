"use client";

import { useMemo, useState } from "react";
import { BarChart3, ChevronUp } from "lucide-react";
import { Page } from "@/components/layout/page";
import { HomeChat } from "@/components/home/home-chat";
import { TodayTasks } from "@/components/reminders/reminders";
import { Headliners } from "@/components/home/headliners";
import { AdvancedAnalytics } from "@/components/home/advanced-analytics";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { useStore } from "@/lib/store/use-store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { productCostPerJar } from "@/lib/summary/recipe-cost";
import { allStandings } from "@/lib/summary/material-stock";
import { cacaoUtilizationPct } from "@/lib/summary/business-config";
import { forecastAll } from "@/lib/summary/forecast";
import { computeHeadliners, type TodayInputs } from "@/lib/home/today";
import type { Product } from "@/lib/store/types";

/**
 * Home answers three things before anyone types: how the business is doing (Today at a
 * glance), what needs attention (the headliners), and — through BAi above them — whatever she
 * wants to ask or log. No charts by default: they live behind Advanced, the only page that
 * has one. Employees see the stock and production side; money stays with executives.
 */
export default function HomePage() {
  const { entries, products, rawMaterials, businessSettings } = useStore();
  const exec = isExecutive(useCurrentUser());
  const costCtx = useCostContext();
  const [advanced, setAdvanced] = useState(false);

  const inputs = useMemo<TodayInputs>(() => {
    const now = new Date();
    const utilization = cacaoUtilizationPct(businessSettings) / 100;
    const lowMaterials = allStandings(entries, products, rawMaterials, utilization)
      .map((s) => ({ s, threshold: s.material.reorderPoint ?? s.material.lowStockThreshold }))
      .filter(({ s, threshold }) => threshold > 0 && s.onHand <= threshold)
      .map(({ s, threshold }) => ({
        name: s.material.name,
        onHand: Math.max(0, Math.round(s.onHand * 100) / 100),
        threshold,
        unit: s.material.unit,
      }));
    return {
      now,
      role: exec ? "executive" : "employee",
      entries,
      products,
      // A product with no recipe, or an ingredient with no price, has no cost yet — never zero.
      costPerUnit: (p: Product) => {
        const cost = productCostPerJar(p, costCtx);
        return cost.batchTotal > 0 && cost.unpriced.length === 0 ? cost.costPerJar : null;
      },
      lowMaterials,
      outlook: forecastAll(products, entries, now).map((f) => ({
        productId: f.productId,
        productName: f.productName,
        forecastQty: f.forecastQty,
      })),
    };
  }, [entries, products, rawMaterials, businessSettings, costCtx, exec]);

  const headliners = useMemo(() => computeHeadliners(inputs), [inputs]);

  return (
    <Page
      title="Home"
      right={
        exec ? (
          <button
            type="button"
            onClick={() => setAdvanced((a) => !a)}
            aria-pressed={advanced}
            className={`flex items-center gap-1.5 rounded-[10px] border px-3.5 py-2 text-[13px] font-semibold transition ${
              advanced ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card text-foreground hover:bg-secondary"
            }`}
          >
            {advanced ? <ChevronUp className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
            {advanced ? "Hide advanced" : "Advanced"}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-12 pb-4">
        {/* BAi on the left, today's task list on the right; on a phone, the tasks come first. */}
        <div className="grid gap-6 min-[1280px]:grid-cols-[minmax(0,1fr)_400px] min-[1280px]:items-start">
          <div className="order-2 min-w-0 min-[1280px]:order-1">
            <HomeChat />
          </div>
          <aside className="order-1 min-[1280px]:sticky min-[1280px]:top-[96px] min-[1280px]:order-2">
            <TodayTasks />
          </aside>
        </div>
        <Headliners items={headliners} />
        {exec && advanced && <AdvancedAnalytics />}
      </div>
    </Page>
  );
}
