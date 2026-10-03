import { addTokenUsage, setApiKeyMissing } from "@/lib/store/store";
import type { AdviceResult } from "@/app/api/advisor/route";
import type { Intent } from "@/lib/ai/intent";

/**
 * Callers for the advisor and the prompt sharpener.
 *
 * Both distinguish "never reached" from "replied with something unusable", for the same reason
 * assistant-client does: when the AI never ran, the app must say so rather than answer anyway.
 * A confident answer produced by a fallback is the failure this project has already been bitten
 * by once.
 */

export type AdviceOutcome =
  | { status: "ok"; advice: AdviceResult; topic: string }
  | { status: "unavailable" }
  | { status: "unreachable"; detail: string | null }
  | { status: "failed" };

export async function requestAdvice(question: string, context: string): Promise<AdviceOutcome> {
  try {
    const res = await fetch("/api/advisor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context }),
    });
    const json = await res.json();

    if (json.usage) {
      addTokenUsage(json.usage.input_tokens ?? 0, json.usage.output_tokens ?? 0);
    }

    if (json.success && json.advice) {
      return { status: "ok", advice: json.advice as AdviceResult, topic: String(json.topic ?? "general") };
    }

    if (json.reason === "missing_api_key") {
      setApiKeyMissing(true);
      return { status: "unavailable" };
    }

    if (json.reason === "ai_error") {
      return { status: "unreachable", detail: typeof json.detail === "string" ? json.detail : null };
    }

    return { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}

export type SharpenOutcome =
  | { status: "ok"; suggestions: string[] }
  | { status: "unavailable" };

/**
 * Sharper versions of a vague question. Any failure returns "unavailable" rather than an error
 * card: the gate is an offer, so when it cannot be made the message should simply go through as
 * written instead of interrupting her with a problem she did not cause.
 */
export async function requestSharpen(text: string, context: string, extra?: string): Promise<SharpenOutcome> {
  try {
    const res = await fetch("/api/sharpen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, context, extra }),
    });
    const json = await res.json();

    if (json.usage) {
      addTokenUsage(json.usage.input_tokens ?? 0, json.usage.output_tokens ?? 0);
    }

    if (json.success && Array.isArray(json.suggestions) && json.suggestions.length > 0) {
      return { status: "ok", suggestions: json.suggestions as string[] };
    }
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Asks the small model which helper should answer, when the word rules were unsure.
 *
 * Any failure returns null and the caller keeps its own guess — triage is an improvement on a
 * guess, never a gate in front of her message.
 */
export async function requestTriage(text: string, products: string[]): Promise<Intent | null> {
  try {
    const res = await fetch("/api/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, products }),
    });
    const json = await res.json();
    if (json.usage) addTokenUsage(json.usage.input_tokens ?? 0, json.usage.output_tokens ?? 0);
    if (json.success && (json.intent === "transaction" || json.intent === "advice" || json.intent === "chat")) {
      return json.intent as Intent;
    }
    return null;
  } catch {
    return null;
  }
}
