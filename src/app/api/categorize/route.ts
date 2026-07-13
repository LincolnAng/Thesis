import { NextRequest, NextResponse } from "next/server";
import { callClaude, stripJsonFences } from "@/lib/ai/client";
import { buildCategorizePrompt, CATEGORIZE_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import type { Entry } from "@/lib/store/types";

const VALID_TYPES = ["SALE", "EXPENSE", "INVENTORY_IN", "INVENTORY_OUT", "WASTE", "SUPPLIER", "NOTE"];
const VALID_PRICE_TYPES = ["standard", "friend", "wholesale"];
const VALID_CATEGORIES = ["raw_materials", "labor", "utilities", "packaging", "transport", "misc"];

export interface CategorizeResult {
  type: Entry["type"];
  amount: number | null;
  quantity: number | null;
  unit: string | null;
  sku: string | null;
  counterparty: string | null;
  location: string | null;
  priceType: Entry["priceType"];
  category: Entry["category"];
  date: string;
  confidence: number;
  notes: string | null;
}

function coerceResult(parsed: Record<string, unknown>, today: string): CategorizeResult {
  const type = VALID_TYPES.includes(parsed.type as string) ? (parsed.type as Entry["type"]) : "NOTE";
  const priceType = VALID_PRICE_TYPES.includes(parsed.priceType as string)
    ? (parsed.priceType as Entry["priceType"])
    : null;
  const category = VALID_CATEGORIES.includes(parsed.category as string)
    ? (parsed.category as Entry["category"])
    : null;
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/[₱,\s]/g, "");
      const n = Number(cleaned);
      return Number.isFinite(n) && cleaned !== "" ? n : null;
    }
    return null;
  };
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

  return {
    type,
    amount: num(parsed.amount),
    quantity: num(parsed.quantity),
    unit: str(parsed.unit),
    sku: str(parsed.sku),
    counterparty: str(parsed.counterparty),
    location: str(parsed.location),
    priceType,
    category,
    date: str(parsed.date) ?? today,
    confidence:
      typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    notes: str(parsed.notes),
  };
}

export async function POST(req: NextRequest) {
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ success: false, reason: "empty_text" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const system = CATEGORIZE_SYSTEM_PROMPT.replace("{{TODAY}}", today);
  const result = await callClaude({ system, prompt: buildCategorizePrompt(text, today), maxTokens: 500 });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, reason: result.error === "missing_api_key" ? "missing_api_key" : "ai_error" },
      { status: 200 },
    );
  }

  try {
    const cleaned = stripJsonFences(result.text);
    const parsed = JSON.parse(cleaned);
    const data = coerceResult(parsed, today);
    return NextResponse.json({ success: true, data, usage: result.usage });
  } catch {
    return NextResponse.json({ success: false, reason: "parse_error", usage: result.usage }, { status: 200 });
  }
}
