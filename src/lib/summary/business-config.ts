import { setBusinessSetting } from "@/lib/store/store";
import {
  FLAT_PROFILE,
  SEEDED_PROFILES,
  normaliseProfile,
  resolveProfiles,
  type ProductPattern,
  type SeasonProfiles,
} from "@/lib/summary/seasonality";

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
  permits: "profile:permits",
  channels: "profile:channels",
  sourcing: "profile:sourcing",
  competitors: "profile:competitors",
  seasonNotes: "profile:seasonNotes",
  goals: "profile:goals",
  seasonProfiles: "seasonality:profiles",
  productSeason: (productId: string) => `seasonality:product:${productId}`,
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

// --- Business profile -----------------------------------------------------------
//
// Facts about the business that no transaction can reveal: which permits are held, where it
// sells, what competitors charge. The assistant used to infer these, which meant inventing
// them — it would advise on consignment without knowing an FDA licence was missing. Recorded
// once here, they turn generic advice into advice about this shop.

/** The permits and registrations a Philippine food business is normally asked for. */
export const PERMIT_IDS = [
  "dti_sec",
  "barangay",
  "mayors",
  "bir",
  "sanitary",
  "fda_lto",
  "fda_cpr",
] as const;
export type PermitId = (typeof PERMIT_IDS)[number];

export const PERMIT_LABELS: Record<PermitId, string> = {
  dti_sec: "Business name (DTI or SEC)",
  barangay: "Barangay clearance",
  mayors: "Mayor's / business permit",
  bir: "BIR registration",
  sanitary: "Sanitary permit",
  fda_lto: "FDA License to Operate",
  fda_cpr: "FDA product registration (CPR)",
};

/** Where the business sells today. Which of these are ticked changes what advice is useful. */
export const CHANNEL_IDS = [
  "bazaar",
  "online_direct",
  "marketplace",
  "consignment",
  "corporate",
  "grocery",
  "export",
] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

export const CHANNEL_LABELS: Record<ChannelId, string> = {
  bazaar: "Bazaars and markets",
  online_direct: "Online, direct (messages)",
  marketplace: "Marketplace (Shopee, TikTok, Lazada)",
  consignment: "Consignment in shops or cafés",
  corporate: "Corporate / bulk orders",
  grocery: "Groceries or supermarkets",
  export: "Export",
};

export interface SourcingProfile {
  /** "market" | "coop" | "farm" | "trader" | "" */
  beanSource: string;
  /** True when one supplier failing would stop production. */
  singleSourced: boolean;
  storageNotes: string;
}

export interface CompetitorPrice {
  name: string;
  sizeG: number;
  pricePhp: number;
  whereSeen: string;
}

export function heldPermits(s: Settings): PermitId[] {
  return json<PermitId[]>(s[KEYS.permits], []).filter((p) => (PERMIT_IDS as readonly string[]).includes(p));
}
export function setHeldPermits(permits: PermitId[]) {
  setBusinessSetting(KEYS.permits, JSON.stringify([...new Set(permits)]));
}

export function activeChannels(s: Settings): ChannelId[] {
  return json<ChannelId[]>(s[KEYS.channels], []).filter((c) => (CHANNEL_IDS as readonly string[]).includes(c));
}
export function setActiveChannels(channels: ChannelId[]) {
  setBusinessSetting(KEYS.channels, JSON.stringify([...new Set(channels)]));
}

export function sourcingProfile(s: Settings): SourcingProfile {
  return json<SourcingProfile>(s[KEYS.sourcing], { beanSource: "", singleSourced: true, storageNotes: "" });
}
export function setSourcingProfile(profile: SourcingProfile) {
  setBusinessSetting(KEYS.sourcing, JSON.stringify(profile));
}

export function competitorPrices(s: Settings): CompetitorPrice[] {
  return json<CompetitorPrice[]>(s[KEYS.competitors], []);
}
export function setCompetitorPrices(rows: CompetitorPrice[]) {
  setBusinessSetting(KEYS.competitors, JSON.stringify(rows));
}

export function seasonNotes(s: Settings): string {
  return (s[KEYS.seasonNotes] ?? "").trim();
}
export function setSeasonNotes(text: string) {
  setBusinessSetting(KEYS.seasonNotes, text.trim());
}

export function businessGoals(s: Settings): string {
  return (s[KEYS.goals] ?? "").trim();
}
export function setBusinessGoals(text: string) {
  setBusinessSetting(KEYS.goals, text.trim());
}

// --- Seasonality ----------------------------------------------------------------
//
// A product's busy months are stored as the twelve numbers themselves, together with where
// they came from and why. They used to be a reference to a named pattern the owner picked
// from a dropdown — but choosing the pattern is the question she is asking, not something she
// already knows. So the app works it out: measured from her own sales where there is enough
// of them, proposed by the assistant with its reasoning where there is not, and only
// overridden by hand if she disagrees.

export function seasonProfilesRaw(s: Settings): SeasonProfiles {
  return json<SeasonProfiles>(s[KEYS.seasonProfiles], {});
}
export function setSeasonProfiles(profiles: SeasonProfiles) {
  setBusinessSetting(KEYS.seasonProfiles, JSON.stringify(profiles));
}

/** Every named pattern, kept only as presets for a manual override. */
export function seasonProfiles(s: Settings): SeasonProfiles {
  return resolveProfiles(seasonProfilesRaw(s));
}

/**
 * The pattern on file for a product.
 *
 * Reads the old "just a profile name" form too, so patterns set before this change keep
 * working rather than silently reverting every product to flat.
 */
export function productPattern(s: Settings, productId: string): ProductPattern | null {
  const raw = (s[KEYS.productSeason(productId)] ?? "").trim();
  if (!raw) return null;

  if (raw.startsWith("{")) {
    const parsed = json<Partial<ProductPattern> | null>(raw, null);
    const months = parsed?.months ? normaliseProfile(parsed.months) : null;
    if (!months) return null;
    return {
      months,
      source: (parsed?.source as ProductPattern["source"]) ?? "manual",
      reason: parsed?.reason ?? "",
      monthsCovered: parsed?.monthsCovered ?? 0,
      updatedAt: parsed?.updatedAt ?? "",
    };
  }

  // Legacy: the value is a profile name picked from the old dropdown. Marked as such so the
  // app knows it may replace it — an owner choosing "flat" from a list she had no way to
  // judge is not the same as her deciding what her year looks like.
  const months = seasonProfiles(s)[raw];
  if (!months) return null;
  return { months, source: "legacy", reason: `Carried over from the old "${raw}" setting.`, monthsCovered: 0, updatedAt: "" };
}

export function setProductPattern(productId: string, pattern: ProductPattern) {
  setBusinessSetting(KEYS.productSeason(productId), JSON.stringify(pattern));
}

export function clearProductPattern(productId: string) {
  setBusinessSetting(KEYS.productSeason(productId), "");
}

/** The twelve multipliers for a product. No pattern on file means no seasonality applied. */
export function multipliersFor(s: Settings, productId: string): number[] {
  return productPattern(s, productId)?.months ?? [...SEEDED_PROFILES[FLAT_PROFILE]];
}

/** Whether a product has a real seasonal shape, or is being treated as flat. */
export function hasSeasonality(s: Settings, productId: string): boolean {
  const pattern = productPattern(s, productId);
  if (!pattern) return false;
  return pattern.months.some((m) => Math.abs(m - 1) > 0.02);
}
