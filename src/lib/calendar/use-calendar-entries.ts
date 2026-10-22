"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/use-store";
import { useProductionPlan } from "@/lib/summary/use-production-plan";
import { toIsoDate, type ProductionPlan, type ScheduleStrategy } from "@/lib/summary/production-schedule";
import { productExpiry } from "@/lib/summary/product-lots";
import { eventPlan, expiringWithinDays, shelfLifeDays, unavailableDays } from "@/lib/summary/business-config";
import { buildCalendarEntries, type CalendarEntry } from "@/lib/calendar/entries";

/**
 * Everything on the Calendar, worked out once from the store — used by the Calendar itself and
 * by the reminders bell, so the two never disagree about what's happening today.
 */
export function useCalendarEntries(strategy: ScheduleStrategy = "fastest"): { all: CalendarEntry[]; plan: ProductionPlan; today: string } {
  const { products, entries, events, eventStock, businessSettings } = useStore();
  const today = toIsoDate(new Date());
  const plan = useProductionPlan(strategy);

  const all = useMemo(() => {
    const within = expiringWithinDays(businessSettings);
    const lotsByProduct = Object.fromEntries(
      products.map((p) => [p.id, productExpiry(entries, p, shelfLifeDays(businessSettings, p.id), within).lots]),
    );
    return buildCalendarEntries({
      today,
      products,
      planDays: plan.days,
      events,
      eventPlans: Object.fromEntries(events.map((e) => [e.id, eventPlan(businessSettings, e.id)])),
      eventStock,
      unavailableDays: unavailableDays(businessSettings),
      entries,
      lotsByProduct,
      expiringWithinDays: within,
      ingredientShortages: plan.ingredientNeeds.filter((n) => n.short > 0),
      lateBatches: plan.needs.filter((n) => n.batchesLate > 0).map((n) => ({ productName: n.productName, batches: n.batchesLate })),
      now: new Date(),
    });
  }, [today, products, plan, events, eventStock, entries, businessSettings]);

  return { all, plan, today };
}
