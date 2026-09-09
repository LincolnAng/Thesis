const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const REQUEST_TIMEOUT_MS = 20_000;

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface AnthropicCallResult {
  ok: boolean;
  text: string;
  usage: AnthropicUsage;
  error?: string;
}

export interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

/** Caller resolves apiKey/model (e.g. from Sheets settings) once and passes them in here —
 * this used to re-fetch settings from Sheets internally on every call, duplicating a read the
 * caller had usually already done. */
export async function callClaude(params: {
  system: string | AnthropicSystemBlock[];
  messages: AnthropicMessage[];
  maxTokens?: number;
  apiKey?: string | null;
  model?: string | null;
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
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
        messages: params.messages,
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

    const json = await res.json();
    // claude-sonnet-5 may prepend a "thinking" content block before the actual "text" block —
    // find the text block explicitly rather than assuming it's always at index 0.
    const textBlock = Array.isArray(json?.content)
      ? json.content.find((block: { type?: string }) => block?.type === "text")
      : undefined;
    const text: string = textBlock?.text ?? "";
    const usage: AnthropicUsage = {
      input_tokens: json?.usage?.input_tokens ?? 0,
      output_tokens: json?.usage?.output_tokens ?? 0,
    };
    return { ok: true, text, usage };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      text: "",
      usage: { input_tokens: 0, output_tokens: 0 },
      error: timedOut
        ? "network_error: request timed out"
        : `network_error: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timeout);
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
