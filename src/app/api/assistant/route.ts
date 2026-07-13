import { NextRequest, NextResponse } from "next/server";
import { callClaude, stripJsonFences } from "@/lib/ai/client";
import { assistantSystemPrompt, buildAssistantPrompt } from "@/lib/ai/prompts";
import { getAiSettings } from "@/lib/sheets/settings";
import type { Entry } from "@/lib/store/types";

const VALID_TYPES = ["SALE", "EXPENSE", "INVENTORY_IN", "INVENTORY_OUT", "WASTE", "SUPPLIER", "NOTE"];
const VALID_PRICE_TYPES = ["standard", "friend", "wholesale"];
const VALID_CATEGORIES = ["raw_materials", "labor", "utilities", "packaging", "transport", "misc"];

export interface AssistantEntryResult {
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

export interface AssistantClarifyOption {
  label: string;
  patch: Partial<AssistantEntryResult>;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[₱,\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) && cleaned !== "" ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function coerceEntry(parsed: Record<string, unknown>, today: string): AssistantEntryResult {
  const type = VALID_TYPES.includes(parsed.type as string) ? (parsed.type as Entry["type"]) : "NOTE";
  const priceType = VALID_PRICE_TYPES.includes(parsed.priceType as string)
    ? (parsed.priceType as Entry["priceType"])
    : null;
  const category = VALID_CATEGORIES.includes(parsed.category as string)
    ? (parsed.category as Entry["category"])
    : null;

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
    confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    notes: str(parsed.notes),
  };
}

function coercePatch(parsed: Record<string, unknown>): Partial<AssistantEntryResult> {
  const patch: Partial<AssistantEntryResult> = {};
  if ("type" in parsed && VALID_TYPES.includes(parsed.type as string)) patch.type = parsed.type as Entry["type"];
  if ("amount" in parsed) patch.amount = num(parsed.amount);
  if ("quantity" in parsed) patch.quantity = num(parsed.quantity);
  if ("unit" in parsed) patch.unit = str(parsed.unit);
  if ("sku" in parsed) patch.sku = str(parsed.sku);
  if ("counterparty" in parsed) patch.counterparty = str(parsed.counterparty);
  if ("location" in parsed) patch.location = str(parsed.location);
  if ("priceType" in parsed && VALID_PRICE_TYPES.includes(parsed.priceType as string)) {
    patch.priceType = parsed.priceType as Entry["priceType"];
  }
  if ("category" in parsed && VALID_CATEGORIES.includes(parsed.category as string)) {
    patch.category = parsed.category as Entry["category"];
  }
  if ("notes" in parsed) patch.notes = str(parsed.notes);
  return patch;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function POST(req: NextRequest) {
  let body: { text?: string; dataSummary?: string; history?: ChatTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ success: false, reason: "empty_message" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  let botLanguage: Awaited<ReturnType<typeof getAiSettings>>["botLanguage"] = "english";
  try {
    botLanguage = (await getAiSettings()).botLanguage;
  } catch {
    // Sheets unavailable — fall back to English rather than failing the whole request.
  }
  const system = assistantSystemPrompt(body.dataSummary ?? "No data available.", today, botLanguage);

  const history = (body.history ?? [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Owner" : "Kuya AI"}: ${m.content}`)
    .join("\n");
  const userPrompt = buildAssistantPrompt(text, today);
  const prompt = history ? `${history}\n${userPrompt}` : userPrompt;

  const result = await callClaude({ system, prompt, maxTokens: 600 });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, reason: result.error === "missing_api_key" ? "missing_api_key" : "ai_error" },
      { status: 200 },
    );
  }

  try {
    const cleaned = stripJsonFences(result.text);
    const parsed = JSON.parse(cleaned);

    if (parsed.mode === "chat") {
      const reply = typeof parsed.reply === "string" ? parsed.reply : "";
      return NextResponse.json({ success: true, mode: "chat", reply, usage: result.usage });
    }

    const entry = coerceEntry(isRecord(parsed.entry) ? parsed.entry : {}, today);
    const clarifyQuestion = typeof parsed.clarifyQuestion === "string" ? parsed.clarifyQuestion : null;
    const clarifyOptionsRaw: unknown[] = Array.isArray(parsed.clarifyOptions) ? parsed.clarifyOptions : [];
    const clarifyOptions: AssistantClarifyOption[] = clarifyOptionsRaw
      .filter((o): o is Record<string, unknown> => isRecord(o) && typeof o.label === "string")
      .map((o) => ({ label: o.label as string, patch: coercePatch(isRecord(o.patch) ? o.patch : {}) }));

    return NextResponse.json({
      success: true,
      mode: "entry",
      entry,
      clarifyQuestion,
      clarifyOptions: clarifyOptions.length > 0 ? clarifyOptions : null,
      usage: result.usage,
    });
  } catch {
    return NextResponse.json({ success: false, reason: "parse_error", usage: result.usage }, { status: 200 });
  }
}
