"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/use-store";
import type { CostContext } from "@/lib/summary/recipe-cost";

/** The key business settings are stored under, so reads and writes can't drift apart. */
export const HOURLY_LABOR_RATE_KEY = "hourly_labor_rate";

export function hourlyLaborRateFrom(settings: Record<string, string>): number {
  return Number(settings[HOURLY_LABOR_RATE_KEY]) || 0;
}

/**
 * One assembled cost context for the whole page. Components take this rather than raw
 * materials, so nothing can cost a product with supplier prices on one screen and without
 * them on another.
 */
export function useCostContext(): CostContext {
  const { rawMaterials, supplierPrices, businessSettings } = useStore();
  const hourlyLaborRate = hourlyLaborRateFrom(businessSettings);
  return useMemo(
    () => ({ rawMaterials, supplierPrices, hourlyLaborRate }),
    [rawMaterials, supplierPrices, hourlyLaborRate],
  );
}
