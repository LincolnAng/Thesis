import type { PricingMode, Product } from "@/lib/store/types";

export interface PricingMethod {
  mode: PricingMode;
  label: string;
  /** One line on how the price comes out, in plain words. */
  hint: string;
}

export const PRICING_METHODS: PricingMethod[] = [
  { mode: "manual", label: "Self pricing", hint: "I'll type the price myself" },
  { mode: "cost_percent", label: "Cost-based", hint: "Cost plus a markup % on top" },
  { mode: "margin", label: "Margin-based", hint: "Keep a set % of the selling price as profit" },
  { mode: "competitive", label: "Market-based", hint: "Match what similar products sell for" },
];

/** A margin of 100% or more has no finite price (every peso would be profit), so the
 * formula is capped just below it. */
export const MAX_MARGIN_PCT = 95;

export function priceFromMarkup(costPerJar: number, markupPct: number): number {
  return costPerJar * (1 + markupPct / 100);
}

export function priceFromMargin(costPerJar: number, marginPct: number): number {
  return costPerJar / (1 - Math.min(Math.max(marginPct, 0), MAX_MARGIN_PCT) / 100);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What changes when the owner switches pricing method, chosen so the price they're charging
 * doesn't jump just because they changed how it's described:
 * - into Self pricing: the price in effect is kept as the typed price;
 * - into Market-based with no market price yet: seeded from the price in effect;
 * - between Cost-based and Margin-based: the % is converted (a 50% markup is a 33% margin).
 */
export function pricingModeChange(product: Product, next: PricingMode, effectivePrice: number): Partial<Product> {
  const from = product.pricingMode;
  if (next === from) return {};
  if (next === "manual") return { pricingMode: next, standardPrice: round2(effectivePrice) };
  if (next === "competitive" && product.marketPrice === 0) {
    return { pricingMode: next, marketPrice: round2(effectivePrice) };
  }
  const pct = product.marginPercent;
  if (from === "cost_percent" && next === "margin") {
    return { pricingMode: next, marginPercent: round2(Math.min((pct / (100 + pct)) * 100, MAX_MARGIN_PCT)) };
  }
  if (from === "margin" && next === "cost_percent") {
    const g = Math.min(pct, MAX_MARGIN_PCT);
    return { pricingMode: next, marginPercent: round2((g / (100 - g)) * 100) };
  }
  return { pricingMode: next };
}
