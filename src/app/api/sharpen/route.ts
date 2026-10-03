import { NextRequest, NextResponse } from "next/server";
import { callClaude, stripJsonFences } from "@/lib/ai/client";
import { getAiSettings } from "@/lib/sheets/settings";

/**
 * Turns a vague question into two to four sharper ones, written against the owner's real data.
 *
 * The owner's prompts are often a topic rather than a question — "help me with pricing" — and a
 * topic produces a general answer she has no way to recognise as general. Rather than guess what
 * she meant, offer the versions she might have meant and let her pick.
 *
 * Suggestions must name her actual products and figures. "Is Classic underpriced?" is useful;
 * "ask a more specific question" is not.
 */

const SYSTEM = `You help the owner of Mang Kiko's Cocoa, a very small Filipino cacao spread producer, ask better questions of her business assistant.

She has no business background. Her questions are often a topic rather than a question, which produces vague answers she cannot tell are vague. Her vague question has been BLOCKED — she cannot send it as written. What you write is what she gets to choose from, so these have to be worth choosing.

You are given her vague message and a briefing on her actual business. Rewrite it as 4 SPECIFIC questions she might have meant.

Every suggestion must pass all four of these, or it is no better than what she typed:
1. It names something real from the briefing — an actual product name, an actual figure, a real month. Never a placeholder, never "your product".
2. It asks for a DECISION she could act on this week, not a topic. "Should I raise Classic to ₱125 before December?" — not "tell me about pricing".
3. It could be answered wrongly. If no possible answer would change what she does, it is still a topic.
4. It is under 18 words, in her plain register, first person, as if she typed it.

Make the four genuinely different from each other — different decisions, not four phrasings of one. Think about which reading of her message is most likely FIRST, but also offer the one she probably has not thought to ask.

Order them by which is most useful given where her business actually is.

Reply with ONLY a single raw JSON object, no fences:
{"suggestions":["...","...","...","..."]}`;

export async function POST(req: NextRequest) {
  let body: { text?: string; context?: string; extra?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ success: false, reason: "empty_message" }, { status: 400 });
  }

  let apiKey: string | null = null;
  let model: string | null = null;
  try {
    const settings = await getAiSettings();
    apiKey = settings.apiKey;
    model = settings.model;
  } catch {
    // Fall through to env defaults.
  }

  const extra = body.extra?.trim();
  const userPrompt = [
    `Her message:\n"""${text}"""`,
    extra ? `She then added, to explain what she meant:\n"""${extra}"""` : "",
    `Briefing on her business:\n${body.context ?? "No data available."}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await callClaude({
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 500,
    apiKey,
    model,
    effort: "low",
  });

  if (!result.ok) {
    console.error(`[sharpen] call failed: ${result.error ?? "unknown"}`);
    return NextResponse.json(
      { success: false, reason: "ai_error", detail: result.error ?? null },
      { status: 200 },
    );
  }

  try {
    const parsed = JSON.parse(stripJsonFences(result.text));
    const suggestions: string[] = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s: unknown): s is string => typeof s === "string" && s.trim() !== "").slice(0, 4)
      : [];
    if (suggestions.length === 0) {
      return NextResponse.json({ success: false, reason: "parse_error" }, { status: 200 });
    }
    return NextResponse.json({ success: true, suggestions, usage: result.usage });
  } catch {
    return NextResponse.json({ success: false, reason: "parse_error" }, { status: 200 });
  }
}
