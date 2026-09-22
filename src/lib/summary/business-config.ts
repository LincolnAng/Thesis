import { setBusinessSetting } from "@/lib/store/store";

/**
 * Typed access to the owner's planning settings, all kept in the key/value businessSettings
 * store (synced to Sheets) so no existing tab needs new columns.
 */

type Settings = Record<string, string>;

const KEYS = {
  salesTarget: "salesTargetMonthly",
  ownerName: "ownerName",
  cacaoUtilization: "cacaoUtilizationPct",
  unavailableDays: "unavailableDays",
  shelfLife: (productId: string) => `shelfLifeDays:${productId}`,
  eventPlan: (eventId: string) => `eventPlan:${eventId}`,
};

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) ? n : fallback;
}

function json<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// --- Owner name -----------------------------------------------------------------

/** What the Home greeting calls the owner — "Hi, Auntie Sandy". Empty until set in Settings. */
export function ownerName(s: Settings): string {
  return (s[KEYS.ownerName] ?? "").trim();
}
export function setOwnerName(name: string) {
  setBusinessSetting(KEYS.ownerName, name.trim());
}

// --- Sales target -------------------------------------------------------------

export function salesTarget(s: Settings): number {
  return num(s[KEYS.salesTarget], 0);
}
export function setSalesTarget(value: number) {
  setBusinessSetting(KEYS.salesTarget, String(Math.max(0, value)));
}

// --- Cacao utilization --------------------------------------------------------

/** Share of raw cacao that ends up usable after roasting, shelling and winnowing. */
export function cacaoUtilizationPct(s: Settings): number {
  return Math.min(100, Math.max(1, num(s[KEYS.cacaoUtilization], 100)));
}
export function setCacaoUtilizationPct(value: number) {
  setBusinessSetting(KEYS.cacaoUtilization, String(Math.min(100, Math.max(1, Math.round(value)))));
}


// --- Unavailable days ---------------------------------------------------------

export function unavailableDays(s: Settings): string[] {
  return json<string[]>(s[KEYS.unavailableDays], []);
}
export function toggleUnavailableDay(s: Settings, isoDate: string) {
  const current = new Set(unavailableDays(s));
  if (current.has(isoDate)) current.delete(isoDate);
  else current.add(isoDate);
  setBusinessSetting(KEYS.unavailableDays, JSON.stringify([...current].sort()));
}

// --- Shelf life ---------------------------------------------------------------

export const DEFAULT_SHELF_LIFE_DAYS = 90;

export function shelfLifeDays(s: Settings, productId: string): number {
  return num(s[KEYS.shelfLife(productId)], DEFAULT_SHELF_LIFE_DAYS);
}
export function setShelfLifeDays(productId: string, days: number) {
  setBusinessSetting(KEYS.shelfLife(productId), String(Math.max(1, Math.round(days))));
}

// --- Event plans ----------------------------------------------------------------

/** Jars per product the owner plans to bring to an event — added to the production target. */
export function eventPlan(s: Settings, eventId: string): Record<string, number> {
  return json<Record<string, number>>(s[KEYS.eventPlan(eventId)], {});
}
export function setEventPlan(eventId: string, plan: Record<string, number>) {
  setBusinessSetting(KEYS.eventPlan(eventId), JSON.stringify(plan));
}
