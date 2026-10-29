import { addMonthSpendUsd, getAiSettings, getMonthSpendUsd } from "@/lib/sheets/settings";
import { aiUsageCollection } from "@/lib/sheets/ai-usage";
import type { AiFeature } from "@/lib/ai/usage-summary";

/**
 * The hard stop on AI spending. Every AI request checks this month's spend against the limit
 * the Executive set in Settings before it goes out, and adds what it cost when it comes back.
 * Once the month's spend reaches the limit, every AI feature stops until the next month or
 * until the limit is raised.
 *
 * Cost is worked out from the token counts each response reports, at Anthropic's list prices
 * (US dollars per million tokens), and shown in pesos at an approximate rate. Each request is
 * also logged on its own (lib/sheets/ai-usage) for the AI costs tab's breakdown.
 */

/** Approximate pesos per US dollar, for showing the limit and spend in pesos. */
export const PHP_PER_USD = 58;

/** List prices, US dollars per million tokens: [input, output]. */
const PRICES: [RegExp, number, number][] = [
  [/^claude-haiku-5/, 0.1, 0.5],
  [/^claude-haiku-4/, 1, 5],
  [/^claude-sonnet-5/, 2, 10],
  [/^claude-sonnet-4/, 3, 15],
  [/^claude-opus-5-5/, 4, 20],
  [/^claude-opus/, 5, 25],
  [/^claude-(fable|mythos)/, 10, 50],
];
/** Each web search, in US dollars. */
const WEB_SEARCH_USD = 0.01;

export interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

export function costUsd(model: string, usage: Usage | null | undefined): number {
  if (!usage) return 0;
  // An unknown model is priced as the most expensive one, so the limit errs on the safe side.
  const [, input, output] = PRICES.find(([re]) => re.test(model)) ?? [null, 10, 50];
  const perToken = (usd: number) => usd / 1_000_000;
  return (
    (usage.input_tokens ?? 0) * perToken(input) +
    (usage.cache_creation_input_tokens ?? 0) * perToken(input) * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * perToken(input) * 0.1 +
    (usage.output_tokens ?? 0) * perToken(output) +
    (usage.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD
  );
}

export { LIMIT_MESSAGE, LIMIT_REACHED } from "@/lib/ai/limit";

/** Whether another AI request may go out this month. Never blocks when the sheet can't be read. */
export async function aiBudgetOpen(): Promise<boolean> {
  try {
    const { monthlyLimitPhp } = await getAiSettings();
    if (!monthlyLimitPhp) return true;
    return (await getMonthSpendUsd()) * PHP_PER_USD < monthlyLimitPhp;
  } catch {
    return true;
  }
}

/** Who an AI request was for and what for. Requests made for one message share a requestId. */
export interface AiUseTag {
  feature: AiFeature;
  requestId: string;
  userId?: string | null;
  userName?: string | null;
}

/** A fresh id for one message's AI requests. */
export const newAiRequestId = () => `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Adds what a response cost to this month's spend, and logs the request. Never throws. */
export async function recordAiUsage(model: string, usage: Usage | null | undefined, tag?: AiUseTag): Promise<void> {
  const usd = costUsd(model, usage);
  // Both at once, so logging adds no wait to the answer. A missed tally is better than a failed answer.
  await Promise.all([
    addMonthSpendUsd(usd).catch(() => undefined),
    aiUsageCollection
      .append({
        id: `${tag?.requestId ?? newAiRequestId()}-${Math.random().toString(36).slice(2, 6)}`,
        at: new Date().toISOString(),
        requestId: tag?.requestId ?? "",
        userId: tag?.userId ?? "",
        userName: tag?.userName ?? "",
        feature: tag?.feature ?? "other",
        model,
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
        searches: usage?.server_tool_use?.web_search_requests ?? 0,
        costUsd: usd,
      })
      .catch(() => undefined),
  ]);
}
