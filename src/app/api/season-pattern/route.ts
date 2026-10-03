import { NextRequest, NextResponse } from "next/server";
import { ADVISOR_MODEL, callClaude, stripJsonFences } from "@/lib/ai/client";
import { getAiSettings } from "@/lib/sheets/settings";

/**
 * Works out which months are busy for a product, and says why.
 *
 * The owner was being asked to pick a seasonal pattern from a dropdown — but "when is this
 * product busy?" is the question she is asking the app, not something she already knows and
 * is merely entering. Where her own sales can answer it, they do (see measureSeasonality).
 * Where they can't yet, this proposes an answer from what the product actually is, and shows
 * its reasoning so she can disagree with something concrete.
 */

export const maxDuration = 60;

const SYSTEM = `You work out when a product sells best over a year, for a very small Filipino food business.

You are given one product and what the owner knows about it. Return twelve multipliers, January first, where 1.0 means an ordinary month, 1.5 means half as much again, and 0.8 means a fifth less.

How to think about it:
- Use the Philippine calendar, not a generic Northern-Hemisphere one. Christmas gifting builds from October and peaks in December. The school year drives "baon" demand. Summer is roughly March to May. Holy Week, Undas and fiesta season shift spending.
- Think about what this specific product IS. A jarred spread bought as a gift peaks at Christmas. A pantry staple bought weekly barely moves. Ice cream peaks in hot months and again in the "ber" months. Anything with alcohol peaks in December.
- Price matters: an expensive item is more likely a gift, so more seasonal. A cheap everyday item is flatter.
- Shelf life matters: something that keeps can be bought ahead; something that doesn't, can't.
- If you genuinely do not know, say so by returning numbers close to 1.0 rather than inventing a dramatic shape. A confident wrong pattern is worse than a flat one.

You may search the web if it would genuinely help — for when Filipinos buy this kind of product, or for local seasonal demand. Do not search for anything you already know.

HARD RULE: the twelve numbers must average very close to 1.00. They describe SHAPE, not growth. If you want to say "this product is growing", that is not seasonality and must not go in these numbers.

Write the reason in plain words the owner would use. One or two short sentences. Name the months. No jargon.

Reply with ONLY a single raw JSON object, no fences:
{"months":[1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0],"reason":"Sells steadily all year, with a lift from October as people buy gifts, and a big December."}`;

function normalise(values: unknown): number[] | null {
  if (!Array.isArray(values) || values.length !== 12) return null;
  const nums = values.map((v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 1));
  const mean = nums.reduce((a, b) => a + b, 0) / 12;
  if (mean <= 0) return null;
  // Rescale to average exactly 1.0. A model that drifts upward would otherwise smuggle growth
  // into the seasonal indices, and the forecast's trend term would then apply it a second time.
  return nums.map((n) => n / mean);
}

export async function POST(req: NextRequest) {
  let body: {
    productName?: string;
    category?: string;
    pricePhp?: number;
    shelfLifeDays?: number;
    monthsOfHistory?: number;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }

  const productName = body.productName?.trim();
  if (!productName) {
    return NextResponse.json({ success: false, reason: "no_product" }, { status: 400 });
  }

  let apiKey: string | null = null;
  try {
    apiKey = (await getAiSettings()).apiKey;
  } catch {
    // Env fallback inside callClaude.
  }

  const facts = [
    `Product: ${productName}`,
    body.category ? `Kind of product: ${body.category}` : "",
    body.pricePhp ? `Sells for: ₱${body.pricePhp}` : "",
    body.shelfLifeDays ? `Shelf life: ${body.shelfLifeDays} days` : "",
    `The business is Mang Kiko's Cocoa, a very small Filipino cacao spread maker selling at bazaars and direct to buyers.`,
    body.monthsOfHistory
      ? `She has ${body.monthsOfHistory} month(s) of sales logged for it — not enough to measure the pattern from her own data, which is why you are being asked.`
      : "She has no sales history for it yet.",
    body.notes ? `What she says about her own seasons: ${body.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await callClaude({
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: facts }],
    maxTokens: 2000,
    apiKey,
    model: ADVISOR_MODEL,
    webSearch: true,
    maxSearches: 2,
    effort: "medium",
  });

  if (!result.ok) {
    console.error(`[season-pattern] call failed: ${result.error ?? "unknown"}`);
    return NextResponse.json({ success: false, reason: "ai_error", detail: result.error ?? null }, { status: 200 });
  }

  try {
    const parsed = JSON.parse(stripJsonFences(result.text));
    const months = normalise(parsed?.months);
    if (!months) return NextResponse.json({ success: false, reason: "parse_error" }, { status: 200 });
    const reason = typeof parsed?.reason === "string" ? parsed.reason.trim() : "";
    return NextResponse.json({ success: true, months, reason, usage: result.usage });
  } catch {
    return NextResponse.json({ success: false, reason: "parse_error" }, { status: 200 });
  }
}
