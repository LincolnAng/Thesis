import { getAiSettings } from "@/lib/sheets/settings";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

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

export async function callClaude(params: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<AnthropicCallResult> {
  let apiKey = process.env.ANTHROPIC_API_KEY;
  let model = CLAUDE_MODEL;
  try {
    const sheetSettings = await getAiSettings();
    if (sheetSettings.apiKey) apiKey = sheetSettings.apiKey;
    if (sheetSettings.model) model = sheetSettings.model;
  } catch {
    // Sheets not configured or unreachable — fall back to env vars silently.
  }

  if (!apiKey) {
    return {
      ok: false,
      text: "",
      usage: { input_tokens: 0, output_tokens: 0 },
      error: "missing_api_key",
    };
  }

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
        messages: [{ role: "user", content: params.prompt }],
      }),
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
    const text: string = json?.content?.[0]?.text ?? "";
    const usage: AnthropicUsage = {
      input_tokens: json?.usage?.input_tokens ?? 0,
      output_tokens: json?.usage?.output_tokens ?? 0,
    };
    return { ok: true, text, usage };
  } catch (err) {
    return {
      ok: false,
      text: "",
      usage: { input_tokens: 0, output_tokens: 0 },
      error: `network_error: ${err instanceof Error ? err.message : String(err)}`,
    };
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
