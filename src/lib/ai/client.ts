const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
/** Advice is the one genuinely hard reasoning job here, so it gets the stronger model.
 * Logging a sale does not, and runs on the cheaper one many times a day. */
export const ADVISOR_MODEL = process.env.ANTHROPIC_ADVISOR_MODEL || "claude-opus-5-5";
const REQUEST_TIMEOUT_MS = 20_000;
/** Searching the web and then writing an answer takes far longer than parsing one sentence. */
const SEARCH_TIMEOUT_MS = 90_000;
/** Each search costs money and time; advice rarely needs more than a few. */
const DEFAULT_MAX_SEARCHES = 4;

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface WebSource {
  title: string;
  url: string;
}

export interface AnthropicCallResult {
  ok: boolean;
  text: string;
  usage: AnthropicUsage;
  error?: string;
  /** Pages the model actually consulted, when web search was enabled. */
  sources?: WebSource[];
}

/** A system-prompt block. Marking the large static block `cache_control: ephemeral` lets
 * Anthropic reuse it across requests instead of reprocessing it every message. */
export interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

/** The caller resolves apiKey/model (from Sheets settings) once and passes them in — this
 * used to re-read settings from Sheets internally on every call, duplicating a round trip
 * the caller had already made and serializing it ahead of the Anthropic request. */
export async function callClaude(params: {
  system: string | AnthropicSystemBlock[];
  messages: AnthropicMessage[];
  maxTokens?: number;
  apiKey?: string | null;
  model?: string | null;
  /** Let the model look things up. Needed for anything the owner's own data can't answer. */
  webSearch?: boolean;
  maxSearches?: number;
  /** How hard to think. "low" for extraction, "high" for advice. */
  effort?: "low" | "medium" | "high" | "xhigh";
}): Promise<AnthropicCallResult> {
  const apiKey = params.apiKey || process.env.ANTHROPIC_API_KEY;
  const model = params.model || CLAUDE_MODEL;

  if (!apiKey) {
    return {
      ok: false,
      text: "",
      usage: { input_tokens: 0, output_tokens: 0 },
      error: "missing_api_key",
    };
  }

  // Without this a hung Anthropic response leaves the request (and the chat UI's typing
  // indicator) spinning indefinitely, with no way back to the manual-entry fallback.
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    params.webSearch ? SEARCH_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
  );

  // Older models reject output_config outright, and the owner can pick a model in Settings —
  // so only send it where it is actually supported rather than risking a 400 on her choice.
  const effort = params.effort && supportsEffort(model) ? params.effort : undefined;

  const tools = params.webSearch
    ? [{ type: "web_search_20260209", name: "web_search", max_uses: params.maxSearches ?? DEFAULT_MAX_SEARCHES }]
    : undefined;

  try {
    // Server tools run on Anthropic's side mid-turn, and the turn can come back as
    // "pause_turn" with the work unfinished. Continuing means sending the assistant content
    // straight back; stopping there would silently return a half-written answer.
    const conversation: unknown[] = [...params.messages];
    let json: Record<string, unknown> = {};
    let text = "";
    const sources: WebSource[] = [];
    const usage: AnthropicUsage = { input_tokens: 0, output_tokens: 0 };

    for (let turn = 0; turn < 4; turn++) {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: params.maxTokens ?? 1000,
          system: params.system,
          messages: conversation,
          ...(tools ? { tools } : {}),
          ...(effort ? { output_config: { effort } } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return {
          ok: false,
          text: "",
          usage: { input_tokens: 0, output_tokens: 0 },
          error: `anthropic_error_${res.status}: ${errText.slice(0, 300)}`,
        };
      }

      json = await res.json();
      const content = Array.isArray(json?.content) ? (json.content as Record<string, unknown>[]) : [];

      // A model with thinking or tool blocks puts text somewhere other than index 0, and with
      // search enabled it may write across several text blocks — take all of them.
      text += content
        .filter((block) => block?.type === "text")
        .map((block) => String(block.text ?? ""))
        .join("");

      collectSources(content, sources);

      const u = (json?.usage ?? {}) as Record<string, number>;
      usage.input_tokens +=
        (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      usage.output_tokens += u.output_tokens ?? 0;

      if (json?.stop_reason !== "pause_turn") break;
      conversation.push({ role: "assistant", content });
    }

    return { ok: true, text, usage, sources: sources.length > 0 ? sources : undefined };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      text: "",
      usage: { input_tokens: 0, output_tokens: 0 },
      error: timedOut ? "network_error: request timed out" : `network_error: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Models that accept output_config.effort. Everything older errors on it. */
function supportsEffort(model: string): boolean {
  return /^claude-(opus-(5|4-6|4-7|4-8)|sonnet-(5|4-6)|fable-5|mythos-5)/.test(model);
}

/**
 * Pulls the pages a web search actually returned out of the response content.
 *
 * Server-tool failures do not throw and do not come back as an HTTP error: the result block
 * arrives with `content` as an error object instead of a list. Branching on that is the
 * difference between "no sources" and a crash on `.map`.
 */
function collectSources(content: Record<string, unknown>[], into: WebSource[]) {
  for (const block of content) {
    if (block?.type !== "web_search_tool_result") continue;
    const inner = block.content;
    if (!Array.isArray(inner)) continue; // an error object, not results
    for (const result of inner as Record<string, unknown>[]) {
      const url = typeof result?.url === "string" ? result.url : "";
      if (!url || into.some((s) => s.url === url)) continue;
      into.push({ title: typeof result?.title === "string" ? result.title : url, url });
    }
  }
}

export function stripJsonFences(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}
