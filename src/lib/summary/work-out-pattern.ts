"use client";

/**
 * Works out a product's busy months, without asking the owner to already know them.
 *
 * Two sources, in a strict order:
 *
 *   1. Her own sales, once there are twelve months of them. Evidence beats opinion, including
 *      the assistant's opinion.
 *   2. The assistant, which proposes a shape from what the product is and says why.
 *
 * Her own manual edit beats both and is never overwritten by this — it is only replaced when
 * she explicitly asks for the pattern to be worked out again.
 */

import { monthlyDemand } from "@/lib/summary/forecast";
import { setProductPattern } from "@/lib/summary/business-config";
import { describePattern, measureSeasonality, type ProductPattern, type SeasonPoint } from "@/lib/summary/seasonality";
import type { Entry, Product } from "@/lib/store/types";

export interface WorkOutResult {
  pattern: ProductPattern | null;
  /** Why it failed, when it did. Shown to the owner rather than swallowed. */
  error?: string;
}

function monthIndexOfKey(key: string): number {
  const month = Number(key.split("-")[1]);
  return Number.isFinite(month) ? Math.min(11, Math.max(0, month - 1)) : 0;
}

async function askAssistant(
  product: Product,
  monthsOfHistory: number,
  shelfLifeDays: number,
  notes: string,
): Promise<{ months: number[]; reason: string } | null> {
  try {
    const res = await fetch("/api/season-pattern", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productName: product.name,
        pricePhp: product.standardPrice,
        shelfLifeDays,
        monthsOfHistory,
        notes,
      }),
    });
    const json = await res.json();
    if (json.success && Array.isArray(json.months) && json.months.length === 12) {
      return { months: json.months as number[], reason: String(json.reason ?? "") };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Decide and store a pattern for one product.
 *
 * Measuring is tried first and silently: it costs nothing, needs no network, and when it
 * works it is strictly better evidence than anything a model can infer about her shop.
 */
export async function workOutPattern(
  product: Product,
  entries: Entry[],
  products: Product[],
  shelfLifeDays: number,
  seasonNotes: string,
): Promise<WorkOutResult> {
  const history = monthlyDemand(product.id, entries, products);
  const points: SeasonPoint[] = history.map((h) => ({ monthIndex: monthIndexOfKey(h.month), units: h.qty }));

  const measured = measureSeasonality(points);
  if (measured.usable) {
    const pattern: ProductPattern = {
      months: measured.months,
      source: "measured",
      reason: `From your own sales across ${measured.monthsCovered} months. ${describePattern(measured.months)}`,
      monthsCovered: measured.monthsCovered,
      updatedAt: new Date().toISOString(),
    };
    setProductPattern(product.id, pattern);
    return { pattern };
  }

  const suggested = await askAssistant(product, history.length, shelfLifeDays, seasonNotes);
  if (!suggested) {
    return {
      pattern: null,
      error: "I couldn't work this one out just now — the assistant didn't answer. Try again in a moment.",
    };
  }

  const pattern: ProductPattern = {
    months: suggested.months,
    source: "suggested",
    reason: suggested.reason || describePattern(suggested.months),
    monthsCovered: measured.monthsCovered,
    updatedAt: new Date().toISOString(),
  };
  setProductPattern(product.id, pattern);
  return { pattern };
}
