import { addTokenUsage, setApiKeyMissing } from "@/lib/store/store";
import type { CategorizeResult } from "@/app/api/categorize/route";

export type CategorizeOutcome =
  | { status: "success"; data: CategorizeResult }
  | { status: "unavailable"; reason: "no_key" | "low_credits_precheck" }
  | { status: "failed" };

export async function requestCategorize(text: string): Promise<CategorizeOutcome> {
  try {
    const res = await fetch("/api/categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const json = await res.json();

    if (json.usage) {
      addTokenUsage(json.usage.input_tokens ?? 0, json.usage.output_tokens ?? 0);
    }

    if (json.success) {
      return { status: "success", data: json.data as CategorizeResult };
    }

    if (json.reason === "missing_api_key") {
      setApiKeyMissing(true);
      return { status: "unavailable", reason: "no_key" };
    }

    return { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
