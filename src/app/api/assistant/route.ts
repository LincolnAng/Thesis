import { NextRequest, NextResponse } from "next/server";
import { callClaude, stripJsonFences, type AnthropicMessage } from "@/lib/ai/client";
import { assistantSystemPromptStatic, assistantSystemPromptDynamic, buildAssistantPrompt } from "@/lib/ai/prompts";
import { getAiSettings } from "@/lib/sheets/settings";
import type { Entry } from "@/lib/store/types";

const VALID_TYPES = ["SALE", "EXPENSE", "INVENTORY_IN", "INVENTORY_OUT", "WASTE", "SUPPLIER", "NOTE"];
const VALID_PRICE_TYPES = ["standard", "friend", "wholesale"];
const DEFAULT_VALID_CATEGORIES = ["raw_materials", "labor", "utilities", "packaging", "transport", "misc"];

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

/** The Anthropic Messages API requires messages to strictly alternate role, starting with
 * "user" — history reconstructed from the chat thread can have consecutive same-role turns
 * (e.g. two owner messages in a row when the assistant's reply to the first was an entry card,
 * not a text message). Collapse consecutive same-role turns into one before sending. */
function mergeConsecutiveRoles(messages: AnthropicMessage[]): AnthropicMessage[] {
  const merged: AnthropicMessage[] = [];
  for (const m of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n${m.content}`;
    } else {
      merged.push({ ...m });
    }
  }
  // Must start with "user" — drop any leading assistant turn(s) rather than error out.
  while (merged.length > 0 && merged[0].role === "assistant") merged.shift();
  return merged;
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

function coerceEntry(parsed: Record<string, unknown>, today: string, validCategories: string[]): AssistantEntryResult {
  const type = VALID_TYPES.includes(parsed.type as string) ? (parsed.type as Entry["type"]) : "NOTE";
  const priceType = VALID_PRICE_TYPES.includes(parsed.priceType as string)
    ? (parsed.priceType as Entry["priceType"])
    : null;
  const category = validCategories.includes(parsed.category as string) ? (parsed.category as Entry["category"]) : null;

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

function coercePatch(parsed: Record<string, unknown>, validCategories: string[]): Partial<AssistantEntryResult> {
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
  if ("category" in parsed && validCategories.includes(parsed.category as string)) {
    patch.category = parsed.category as Entry["category"];
  }
  if ("notes" in parsed) patch.notes = str(parsed.notes);
  return patch;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function POST(req: NextRequest) {
  let body: { text?: string; dataSummary?: string; history?: ChatTurn[]; categories?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ success: false, reason: "empty_message" }, { status: 400 });
  }

  const validCategories =
    Array.isArray(body.categories) && body.categories.length > 0 ? body.categories : DEFAULT_VALID_CATEGORIES;

  const today = new Date().toISOString().slice(0, 10);
  // One settings read for the whole request — this used to be fetched a second time inside
  // callClaude() itself, adding a redundant, fully-serial Sheets round trip before every
  // Anthropic call. apiKey/model are now passed straight through instead.
  let apiKey: string | null = null;
  let model: string | null = null;
  let botLanguage: Awaited<ReturnType<typeof getAiSettings>>["botLanguage"] = "english";
  try {
    const settings = await getAiSettings();
    apiKey = settings.apiKey;
    model = settings.model;
    botLanguage = settings.botLanguage;
  } catch {
    // Sheets unavailable — fall back to English/env defaults rather than failing the whole request.
  }

  // Static instructions/persona/glossary as their own cache_control block (identical across
  // requests for a given language+category set, so Anthropic can cache it), the live data
  // summary as a separate small trailing block that changes every request.
  const system = [
    { type: "text" as const, text: assistantSystemPromptStatic(botLanguage, validCategories), cache_control: { type: "ephemeral" as const } },
    { type: "text" as const, text: assistantSystemPromptDynamic(body.dataSummary ?? "No data available.") },
  ];

  // Real multi-turn messages instead of flattening history into one text blob — the last 6
  // turns come straight through as alternating user/assistant turns, with only the newest
  // message appended last.
  const historyMessages: AnthropicMessage[] = (body.history ?? []).slice(-6).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const messages = mergeConsecutiveRoles([
    ...historyMessages,
    { role: "user", content: buildAssistantPrompt(text, today) },
  ]);

  const result = await callClaude({ system, messages, maxTokens: 600, apiKey, model });

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

    const entry = coerceEntry(isRecord(parsed.entry) ? parsed.entry : {}, today, validCategories);
    const clarifyQuestion = typeof parsed.clarifyQuestion === "string" ? parsed.clarifyQuestion : null;
    const clarifyOptionsRaw: unknown[] = Array.isArray(parsed.clarifyOptions) ? parsed.clarifyOptions : [];
    const clarifyOptions: AssistantClarifyOption[] = clarifyOptionsRaw
      .filter((o): o is Record<string, unknown> => isRecord(o) && typeof o.label === "string")
      .map((o) => ({ label: o.label as string, patch: coercePatch(isRecord(o.patch) ? o.patch : {}, validCategories) }));

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
