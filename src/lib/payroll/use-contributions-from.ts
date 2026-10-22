"use client";

import { useStore } from "@/lib/store/use-store";
import { CONTRIBUTIONS_FROM_KEY, DEFAULT_CONTRIBUTIONS_FROM } from "@/lib/payroll/contributions";

/** When the shop starts deducting SSS, PhilHealth and Pag-IBIG — set on the Salaries tab. */
export function useContributionsFrom(): string {
  const { businessSettings } = useStore();
  return businessSettings[CONTRIBUTIONS_FROM_KEY] || DEFAULT_CONTRIBUTIONS_FROM;
}
