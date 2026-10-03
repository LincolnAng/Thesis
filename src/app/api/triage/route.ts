import { NextRequest, NextResponse } from "next/server";
import { callClaude, stripJsonFences } from "@/lib/ai/client";
import { getAiSettings } from "@/lib/sheets/settings";

/**
 * Decides which of the three helpers should answer, when the word rules can't.
 *
 * The rules get the obvious cases right for free — "sold 10 jars to Nena" is a log, "hi" is
 * small talk — and those are most of what she types. But a keyword list has blind spots by
 * construction: "how much is cacao in the world market" had no question mark and no advice
 * verb, so it fell through to the assistant, which can only see her own books, and dead-ended.
 *
 * Rather than keep adding words, anything the rules are unsure about comes here. This runs on
 * the small fast model with a tiny prompt — a fraction of a centavo and about a second — which
 * is worth paying on an uncertain message and not worth paying on a certain one.
 */

export const maxDuration = 30;

/** Small and fast on purpose: this is a one-word decision, not a reasoning task. */
const TRIAGE_MODEL = process.env.ANTHROPIC_TRIAGE_MODEL || "claude-haiku-4-5";

const SYSTEM = `You route one message from the owner of a small Filipino cacao spread business to the right helper. She writes in English, Tagalog, Cebuano, or a mix.

Choose exactly one:

"log" — she is REPORTING SOMETHING THAT HAPPENED in her business: a sale, a purchase, a batch made, stock spoiled or given away, money paid. Past tense. Even with no numbers. Examples: "sold 10 jars to Nena", "nabenta ko yung crunch", "bumili ng beans", "may nasira na 3".

"records" — she is asking about HER OWN figures, which the app already holds: revenue, profit, margins, stock levels, her customers, her own prices and costs. Also greetings and small talk. Examples: "how much did I make this month", "how many jars left", "who buys the most", "hello".

"research" — the answer needs something OUTSIDE her records, or it is asking for advice, a plan, or a judgement: world or local market prices, what other shops charge, permits, regulations, export rules, trends, or any "should I / what should I / is it worth it" question. Examples: "how much is cacao in the world market", "should I raise my prices", "what permits do I need", "any ideas for a new flavour".

Deciding rules:
- If something HAPPENED, it is "log" — even if it also mentions prices or the market.
- If it asks for a judgement or a plan, it is "research", even about her own numbers.
- If you are torn between "records" and "research", choose "research". It can see her figures too, and it can also look things up; the records helper cannot look anything up and will dead-end.

Reply with ONLY: {"mode":"log"} or {"mode":"records"} or {"mode":"research"}`;

export async function POST(req: NextRequest) {
  let body: { text?: string; products?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) return NextResponse.json({ success: false }, { status: 400 });

  let apiKey: string | null = null;
  try {
    apiKey = (await getAiSettings()).apiKey;
  } catch {
    // Env fallback inside callClaude.
  }

  // Her product names, so "how's the Crunch doing" is recognised as being about her records.
  const products = Array.isArray(body.products) ? body.products.slice(0, 20).join(", ") : "";
  const userPrompt = products
    ? `Her products are: ${products}.\n\nHer message:\n"""${text}"""`
    : `Her message:\n"""${text}"""`;

  const result = await callClaude({
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 20,
    apiKey,
    model: TRIAGE_MODEL,
  });

  if (!result.ok) {
    // Never block on this. The caller keeps whatever the word rules guessed.
    return NextResponse.json({ success: false, reason: result.error ?? "unknown" }, { status: 200 });
  }

  try {
    const parsed = JSON.parse(stripJsonFences(result.text));
    const mode = parsed?.mode;
    const intent = mode === "log" ? "transaction" : mode === "research" ? "advice" : mode === "records" ? "chat" : null;
    if (!intent) return NextResponse.json({ success: false, reason: "unparsed" }, { status: 200 });
    return NextResponse.json({ success: true, intent, usage: result.usage });
  } catch {
    return NextResponse.json({ success: false, reason: "unparsed" }, { status: 200 });
  }
}
