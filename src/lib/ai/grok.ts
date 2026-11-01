import type { Usage } from "@/lib/ai/spend";

/**
 * Grok (xAI), as the other provider the app can run on. Which one answers is decided by the key
 * saved in Settings: an "xai-" key means Grok, anything else Claude — so switching is pasting a
 * different key, and switching back is pasting the old one.
 *
 * Grok speaks the Responses API (https://docs.x.ai): a request carries `input` items, and the
 * reply's `output` holds messages, function calls and web-search calls. A tool round-trip goes
 * back with `previous_response_id`, so xAI keeps the conversation between the steps.
 *
 * Model choice mirrors Claude's tiers: quick admin work on the cheap non-reasoning model, the
 * rest on the flagship. A Grok model typed into Settings is used as is.
 */

export type Provider = "claude" | "grok";

export const providerOf = (apiKey: string | null | undefined): Provider => (apiKey?.trim().startsWith("xai-") ? "grok" : "claude");

const GROK_URL = "https://api.x.ai/v1/responses";
export const GROK_QUICK_MODEL = process.env.XAI_QUICK_MODEL || "grok-4.20-0309-non-reasoning";
export const GROK_DEEP_MODEL = process.env.XAI_MODEL || "grok-4.7";

/** The Grok model for a job the code names by its Claude model: Haiku's work → quick, the rest → flagship. */
export function grokModelFor(model: string): string {
  if (model.startsWith("grok-")) return model;
  return /haiku/.test(model) ? GROK_QUICK_MODEL : GROK_DEEP_MODEL;
}

/** A tool BAi can call, as Claude defines it (name, description, input_schema). */
export interface ToolDef {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

/** Claude's tool definitions in Grok's shape, plus Grok's own web search when asked for. */
export function grokTools(tools: ToolDef[], webSearch: boolean): Record<string, unknown>[] {
  return [
    ...tools.map((t) => ({ type: "function", name: t.name, description: t.description ?? "", parameters: t.input_schema })),
    ...(webSearch ? [{ type: "web_search" }] : []),
  ];
}

export interface GrokCall {
  callId: string;
  name: string;
  input: Record<string, unknown>;
}

export interface GrokResult {
  ok: boolean;
  /** For continuing with previous_response_id. */
  id: string;
  text: string;
  calls: GrokCall[];
  sources: { title: string; url: string }[];
  usedWeb: boolean;
  /** In the shape the spend tally (lib/ai/spend) reads. */
  usage: Usage;
  /** HTTP status and xAI's message when it failed. */
  status?: number;
  error?: string;
}

/** One request to Grok. Never throws: a network failure or timeout comes back as `ok: false`. */
export async function grokRespond(params: {
  apiKey: string;
  model: string;
  input: unknown[];
  tools?: Record<string, unknown>[];
  maxTokens?: number;
  previousResponseId?: string;
  signal?: AbortSignal;
}): Promise<GrokResult> {
  const empty = { id: "", text: "", calls: [], sources: [], usedWeb: false, usage: {} };
  try {
    const res = await fetch(GROK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.apiKey}` },
      body: JSON.stringify({
        model: params.model,
        input: params.input,
        ...(params.tools?.length ? { tools: params.tools } : {}),
        // Counts only the visible answer; reasoning has its own allowance.
        ...(params.maxTokens ? { max_output_tokens: params.maxTokens } : {}),
        ...(params.previousResponseId ? { previous_response_id: params.previousResponseId } : {}),
      }),
      signal: params.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, ...empty, status: res.status, error: `grok_error_${res.status}: ${detail.slice(0, 300)}` };
    }
    return { ok: true, ...readResponse(await res.json()) };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return { ok: false, ...empty, error: timedOut ? "network_error: request timed out" : `network_error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

type Json = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** The text, tool calls, sources and usage out of a Responses API reply. Exported for tests. */
export function readResponse(json: Json): Omit<GrokResult, "ok"> {
  const output = Array.isArray(json.output) ? (json.output as Json[]) : [];
  let text = "";
  const calls: GrokCall[] = [];
  const sources = new Map<string, { title: string; url: string }>();
  let searches = 0;

  for (const item of output) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content as Json[]) {
        if (part.type !== "output_text") continue;
        text += String(part.text ?? "");
        for (const a of Array.isArray(part.annotations) ? (part.annotations as Json[]) : []) {
          const url = typeof a.url === "string" ? a.url : "";
          // Grok's citation title is just its number ("1"), so the site's name stands in.
          if (a.type === "url_citation" && url && !sources.has(url)) sources.set(url, { title: titleOf(a.title, url), url });
        }
      }
    } else if (item.type === "function_call") {
      let input: Json = {};
      try {
        input = JSON.parse(String(item.arguments ?? "{}")) as Json;
      } catch {
        // Unreadable arguments: the tool reports what's missing and the model tries again.
      }
      calls.push({ callId: String(item.call_id ?? item.id ?? ""), name: String(item.name ?? ""), input });
    } else if (item.type === "web_search_call") {
      searches += 1;
    }
  }
  for (const url of Array.isArray(json.citations) ? json.citations : []) {
    if (typeof url === "string" && !sources.has(url)) sources.set(url, { title: titleOf(null, url), url });
  }

  const u = (json.usage ?? {}) as Json;
  const cached = num((u.input_tokens_details as Json | undefined)?.cached_tokens);
  const reasoning = num((u.output_tokens_details as Json | undefined)?.reasoning_tokens);
  const ticks = u.cost_in_usd_ticks;
  const usage: Usage = {
    input_tokens: Math.max(0, num(u.input_tokens) - cached),
    cache_read_input_tokens: cached,
    // Reasoning is billed as output but reported apart from it.
    output_tokens: num(u.output_tokens) + reasoning,
    server_tool_use: { web_search_requests: searches },
    // xAI says what the request cost (10 billion ticks to the dollar); that beats a price table.
    ...(typeof ticks === "number" && ticks >= 0 ? { cost_usd: ticks / 1e10 } : {}),
  };

  return { id: String(json.id ?? ""), text: text.trim(), calls, sources: [...sources.values()], usedWeb: searches > 0 || sources.size > 0, usage };
}

function titleOf(title: unknown, url: string): string {
  if (typeof title === "string" && title && !/^\d+$/.test(title)) return title;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
