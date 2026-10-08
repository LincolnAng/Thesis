"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/use-store";
import { buildProductionPlan, type ProductionPlan, type ScheduleStrategy } from "@/lib/summary/production-schedule";
import {
  cacaoUtilizationPct,
  eventPlan,
  multipliersFor,
  shelfLifeDays,
  unavailableDays,
} from "@/lib/summary/business-config";

/**
 * The one answer to "what do I need to make?".
 *
 * There used to be two. Inventory built a full plan — seasonality, event plans, shelf life,
 * equipment, and crucially what the shelf already covers. Home worked it out again from
 * scratch with a rule of its own: below the warning level means make a batch. So Home said
 * "Cocoa Crunch is running low — make 1 batch soon" on the same morning Inventory said
 * "Nothing — stock already covers November and your events". Both were reporting honestly;
 * they were answering different questions and presenting both as the same one.
 *
 * Two screens disagreeing about what to do today is worse than either being slightly wrong,
 * because it costs the owner her trust in both. So there is one plan now, and anything that
 * wants to talk about production asks this.
 */
export function useProductionPlan(strategy: ScheduleStrategy = "fastest"): ProductionPlan {
  const { products, entries, machines, rawMaterials, events, businessSettings } = useStore();

  const eventPlans = useMemo(
    () => Object.fromEntries(events.map((e) => [e.id, eventPlan(businessSettings, e.id)])),
    [events, businessSettings],
  );

  return useMemo(
    () =>
      buildProductionPlan({
        products,
        entries,
        machines,
        rawMaterials,
        events,
        eventPlans,
        unavailable: new Set(unavailableDays(businessSettings)),
        shelfLifeDays: (id) => shelfLifeDays(businessSettings, id),
        cacaoUtilization: cacaoUtilizationPct(businessSettings) / 100,
        seasonMultipliers: (productId) => multipliersFor(businessSettings, productId),
        strategy,
      }),
    [products, entries, machines, rawMaterials, events, eventPlans, businessSettings, strategy],
  );
}
