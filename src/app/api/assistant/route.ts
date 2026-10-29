import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { callClaude, stripJsonFences, type AnthropicMessage } from "@/lib/ai/client";
import { assistantSystemPromptStatic, assistantSystemPromptDynamic, buildAssistantPrompt } from "@/lib/ai/prompts";
import { getAiSettings } from "@/lib/sheets/settings";
import { QUICK_MODEL } from "@/lib/ai/route-model";
import { normalizeUnit } from "@/lib/units";
import type { Entry } from "@/lib/store/types";
import { INVESTMENT_CATEGORIES } from "@/lib/format";

const VALID_TYPES = ["SALE", "EXPENSE", "RND", "INVENTORY_IN", "INVENTORY_OUT", "WASTE", "SUPPLIER", "NOTE"];
const VALID_PRICE_TYPES = ["standard", "friend", "wholesale"];
const STATED_FIELDS = [
  "amount", "quantity", "unit", "sku", "counterparty", "category", "priceType", "notes",
  "paymentTerm", "dueDate", "paymentMethod", "bankName", "paymentTerms",
];
const VALID_PAYMENT_TERMS = ["spot", "receivable", "payable"];
const VALID_METHODS = ["cash", "bank_transfer", "ewallet", "check"];
const VALID_AGREEMENTS = ["immediate", "net_7", "net_15", "net_30", "date", "custom"];

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
  /** Spot unless she said it is owed: a sale on credit (utang) or a purchase paid later. */
  paymentTerm: Entry["paymentTerm"];
  dueDate: string | null;
  /** "cash", "bank_transfer", "ewallet" or "check" when she said how it was paid; otherwise null — never guessed. */
  paymentMethod: string | null;
  bankName: string | null;
  /** The agreement behind the due date: immediate, net_7, net_15, net_30, date or custom. */
  paymentTerms: string | null;
  /**
   * Set when the message is a payment against something that is ALREADY owed ("Juan paid 3,000
   * of the 8,000 he owes me"), not a new sale or expense. The app finds the existing receivable
   * or payable and adds the payment to it; this never becomes a second record.
   */
  settles: "receivable" | "payable" | null;
}

/** Only a sale can be owed to the business and only an expense by it. */
function coerceTerm(type: Entry["type"] | undefined, raw: unknown): Entry["paymentTerm"] {
  if (!VALID_PAYMENT_TERMS.includes(raw as string)) return null;
  if (raw === "receivable") return type === "SALE" ? "receivable" : null;
  if (raw === "payable") return type === "EXPENSE" ? "payable" : null;
  return "spot";
}

function coerceDay(raw: unknown): string | null {
  const s = str(raw);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/** An investment's kind comes from its own list; an expense's from her expense categories. */
function coerceCategory(type: Entry["type"] | undefined, raw: unknown, validCategories: string[]): Entry["category"] {
  if (type === "RND") return (INVESTMENT_CATEGORIES as readonly string[]).includes(raw as string) ? (raw as string) : "rnd";
  return validCategories.includes(raw as string) ? (raw as Entry["category"]) : null;
}

export interface AssistantClarifyOption {
  label: string;
  patch: Partial<AssistantEntryResult>;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** The Messages API requires strictly alternating roles starting with "user". History
 * rebuilt from the chat thread can have two owner messages in a row (when the assistant
 * answered the first with an entry card rather than text), so collapse runs of the same
 * role before sending. */
function mergeConsecutiveRoles(messages: AnthropicMessage[]): AnthropicMessage[] {
  const merged: AnthropicMessage[] = [];
  for (const m of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n${m.content}`;
    else merged.push({ ...m });
  }
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
  const category = coerceCategory(type, parsed.category, validCategories);

  return {
    type,
    amount: num(parsed.amount),
    quantity: num(parsed.quantity),
    unit: normalizeUnit(str(parsed.unit)),
    sku: str(parsed.sku),
    counterparty: str(parsed.counterparty),
    location: str(parsed.location),
    priceType,
    category,
    date: str(parsed.date) ?? today,
    confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    notes: str(parsed.notes),
    paymentTerm: coerceTerm(type, parsed.paymentTerm),
    dueDate: coerceDay(parsed.dueDate),
    paymentMethod: VALID_METHODS.includes(parsed.paymentMethod as string) ? (parsed.paymentMethod as string) : null,
    bankName: str(parsed.bankName),
    paymentTerms: VALID_AGREEMENTS.includes(parsed.paymentTerms as string) ? (parsed.paymentTerms as string) : null,
    settles: parsed.settles === "receivable" || parsed.settles === "payable" ? parsed.settles : null,
  };
}

function coercePatch(parsed: Record<string, unknown>, validCategories: string[]): Partial<AssistantEntryResult> {
  const patch: Partial<AssistantEntryResult> = {};
  if ("type" in parsed && VALID_TYPES.includes(parsed.type as string)) patch.type = parsed.type as Entry["type"];
  if ("amount" in parsed) patch.amount = num(parsed.amount);
  if ("quantity" in parsed) patch.quantity = num(parsed.quantity);
  if ("unit" in parsed) patch.unit = normalizeUnit(str(parsed.unit));
  if ("sku" in parsed) patch.sku = str(parsed.sku);
  if ("counterparty" in parsed) patch.counterparty = str(parsed.counterparty);
  if ("location" in parsed) patch.location = str(parsed.location);
  if ("priceType" in parsed && VALID_PRICE_TYPES.includes(parsed.priceType as string)) {
    patch.priceType = parsed.priceType as Entry["priceType"];
  }
  if ("category" in parsed) {
    const category = coerceCategory(patch.type, parsed.category, validCategories);
    if (category) patch.category = category;
  }
  if ("paymentTerm" in parsed) patch.paymentTerm = coerceTerm(patch.type ?? (VALID_TYPES.includes(parsed.type as string) ? (parsed.type as Entry["type"]) : undefined), parsed.paymentTerm) ?? undefined;
  if ("dueDate" in parsed) patch.dueDate = coerceDay(parsed.dueDate);
  if ("paymentMethod" in parsed && VALID_METHODS.includes(parsed.paymentMethod as string)) patch.paymentMethod = parsed.paymentMethod as string;
  if ("bankName" in parsed) patch.bankName = str(parsed.bankName);
  if ("notes" in parsed) patch.notes = str(parsed.notes);
  return patch;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.denied) return auth.denied;
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
  // One settings read for the whole request (and cached in-process for a minute) — this used
  // to be fetched here AND again inside callClaude, two serial Sheets round trips before the
  // Anthropic request could even begin.
  let apiKey: string | null = null;
  // Turning a typed line into a record is admin work: always the small, cheap model, whatever
  // model Settings picks for the deeper questions.
  const model = QUICK_MODEL;
  let botLanguage: Awaited<ReturnType<typeof getAiSettings>>["botLanguage"] = "english";
  try {
    const settings = await getAiSettings();
    apiKey = settings.apiKey;
    botLanguage = settings.botLanguage;
  } catch {
    // Sheets unavailable — fall back to English/env defaults rather than failing the request.
  }

  const system = [
    {
      type: "text" as const,
      text: assistantSystemPromptStatic(botLanguage, validCategories),
      cache_control: { type: "ephemeral" as const },
    },
    { type: "text" as const, text: assistantSystemPromptDynamic(body.dataSummary ?? "No data available.") },
  ];

  // Real alternating turns instead of one flattened "Owner: ... / BAi: ..." blob.
  const historyMessages: AnthropicMessage[] = (body.history ?? [])
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content }));
  const messages = mergeConsecutiveRoles([...historyMessages, { role: "user", content: buildAssistantPrompt(text, today) }]);

  // Pulling fields out of "sold 10 jars to Nena" is extraction, not reasoning. Low effort is
  // both cheaper and faster on the thing the owner does many times a day.
  const result = await callClaude({
    system,
    messages,
    maxTokens: 600,
    apiKey,
    model,
    effort: "low",
    use: { feature: "assistant", userId: auth.session.userId, userName: auth.session.name },
  });

  if (!result.ok) {
    // The caller only ever sees "ai_error", which is all the owner can act on — but without
    // this line a wrong model name, an expired key and a timeout are indistinguishable to
    // anyone trying to fix it.
    console.error(`[assistant] call failed: ${result.error ?? "unknown"}`);
    return NextResponse.json(
      {
        success: false,
        reason: result.error === "missing_api_key" ? "missing_api_key" : "ai_error",
        // Passed through so Settings can show the owner the real reason — "invalid key",
        // "not scoped to a workspace", "timed out" are all fixable, but only if seen.
        detail: result.error ?? null,
      },
      { status: 200 },
    );
  }

  try {
    const cleaned = stripJsonFences(result.text);
    const parsed = JSON.parse(cleaned);

    if (parsed.mode === "chat") {
      const reply = typeof parsed.reply === "string" ? parsed.reply : "";
      // The model says this needs something outside her ledger. An empty reply means the same
      // thing by accident, so treat it the same rather than showing her a blank bubble.
      const needsLookup = parsed.needsLookup === true || reply.trim() === "";
      return NextResponse.json({ success: true, mode: "chat", reply, needsLookup, usage: result.usage });
    }

    const entry = coerceEntry(isRecord(parsed.entry) ? parsed.entry : {}, today, validCategories);
    // Which fields the owner actually said, so the review card can mark the rest as guesses.
    // A model that omits this gets no benefit of the doubt: nothing counts as stated.
    const statedRaw: unknown[] = Array.isArray(parsed.stated) ? parsed.stated : [];
    const stated = statedRaw.filter((f): f is string => typeof f === "string" && STATED_FIELDS.includes(f));
    const clarifyQuestion = typeof parsed.clarifyQuestion === "string" ? parsed.clarifyQuestion : null;
    const clarifyOptionsRaw: unknown[] = Array.isArray(parsed.clarifyOptions) ? parsed.clarifyOptions : [];
    const clarifyOptions: AssistantClarifyOption[] = clarifyOptionsRaw
      .filter((o): o is Record<string, unknown> => isRecord(o) && typeof o.label === "string")
      .map((o) => ({ label: o.label as string, patch: coercePatch(isRecord(o.patch) ? o.patch : {}, validCategories) }));

    return NextResponse.json({
      success: true,
      mode: "entry",
      entry,
      stated,
      clarifyQuestion,
      clarifyOptions: clarifyOptions.length > 0 ? clarifyOptions : null,
      usage: result.usage,
    });
  } catch {
    return NextResponse.json({ success: false, reason: "parse_error", usage: result.usage }, { status: 200 });
  }
}
