import { NextRequest, NextResponse } from "next/server";
import { ADVISOR_MODEL, callClaude, stripJsonFences } from "@/lib/ai/client";
import { advisorSystemPrompt, advisorUserPrompt, detectTopic } from "@/lib/ai/advisor-prompts";
import { getAiSettings } from "@/lib/sheets/settings";

/**
 * Business advice, grounded in the owner's own data.
 *
 * Separate from /api/assistant on purpose: that route logs transactions, its system prompt is
 * cached, and it is called many times a day. This one is called rarely, sends a much larger
 * briefing and asks for a much longer answer. Keeping them apart keeps the common path cheap.
 */

// Vercel defaults serverless functions to 10 seconds. Searching the web and then reasoning
// over the results takes far longer than that, so without this the advisor works locally and
// times out in production — the worst way to find a limit.
export const maxDuration = 60;

export interface AdviceStep {
  do: string;
  detail: string;
}

export interface AdviceSource {
  what: string;
  url: string;
}

export interface AdviceResult {
  headline: string;
  because: string;
  steps: AdviceStep[];
  headsUp: string;
  sources: AdviceSource[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function coerce(parsed: Record<string, unknown>, searched: { title: string; url: string }[]): AdviceResult {
  const stepsRaw = Array.isArray(parsed.steps) ? parsed.steps : [];
  const steps: AdviceStep[] = stepsRaw
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({ do: str(r.do), detail: str(r.detail) }))
    .filter((r) => r.do)
    // The prompt asks for at most three. Enforce it here too — a model that overruns the
    // instruction shouldn't be able to put a wall of text back on the screen.
    .slice(0, 3);

  const sourcesRaw = Array.isArray(parsed.sources) ? parsed.sources : [];
  const sources: AdviceSource[] = sourcesRaw
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({ what: str(r.what), url: str(r.url) }))
    .filter((r) => r.url.startsWith("http"));

  // Anything it actually opened but didn't cite still gets shown, so the owner can always see
  // where an external claim came from.
  for (const page of searched) {
    if (sources.length >= 5) break;
    if (!sources.some((x) => x.url === page.url)) sources.push({ what: page.title, url: page.url });
  }

  return {
    headline: str(parsed.headline),
    because: str(parsed.because),
    steps,
    headsUp: str(parsed.headsUp ?? parsed.heads_up),
    sources,
  };
}

export async function POST(req: NextRequest) {
  let body: { question?: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ success: false, reason: "empty_question" }, { status: 400 });
  }

  let apiKey: string | null = null;
  let botLanguage: Awaited<ReturnType<typeof getAiSettings>>["botLanguage"] = "english";
  try {
    const settings = await getAiSettings();
    apiKey = settings.apiKey;
    // settings.model is deliberately ignored: it drives logging and chat, while advice always
    // runs on the stronger model regardless of what is chosen there.
    botLanguage = settings.botLanguage;
  } catch {
    // Sheets unavailable — fall back to env defaults rather than failing the request.
  }

  const topic = detectTopic(question);
  const system = [
    {
      type: "text" as const,
      text: advisorSystemPrompt(topic, botLanguage),
      cache_control: { type: "ephemeral" as const },
    },
    {
      type: "text" as const,
      text: `Briefing on the owner's business as of now:\n\n${body.context ?? "No data available."}`,
    },
  ];

  const today = new Date().toISOString().slice(0, 10);
  const result = await callClaude({
    system,
    messages: [{ role: "user", content: advisorUserPrompt(question, today) }],
    // Short answers, but web search and any thinking blocks share this budget.
    // Thinking tokens share this budget, and high effort uses a lot of them.
    maxTokens: 8000,
    apiKey,
    // Her Settings model choice drives logging and chat; advice overrides it with the
    // stronger model, because this is the one job that actually needs the reasoning.
    model: ADVISOR_MODEL,
    effort: "high",
    // Permits, fees, competitor prices and trends are not in her ledger and never will be.
    webSearch: true,
  });

  if (!result.ok) {
    console.error(`[advisor] call failed: ${result.error ?? "unknown"}`);
    return NextResponse.json(
      {
        success: false,
        reason: result.error === "missing_api_key" ? "missing_api_key" : "ai_error",
        detail: result.error ?? null,
      },
      { status: 200 },
    );
  }

  try {
    const parsed = JSON.parse(stripJsonFences(result.text));
    const advice = coerce(parsed, result.sources ?? []);
    if (!advice.headline && advice.steps.length === 0) {
      return NextResponse.json({ success: false, reason: "parse_error", usage: result.usage }, { status: 200 });
    }
    return NextResponse.json({ success: true, topic, advice, usage: result.usage });
  } catch {
    return NextResponse.json({ success: false, reason: "parse_error", usage: result.usage }, { status: 200 });
  }
}
