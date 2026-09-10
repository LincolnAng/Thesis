import { addTokenUsage, setApiKeyMissing } from "@/lib/store/store";
import type { AssistantClarifyOption, AssistantEntryResult } from "@/app/api/assistant/route";

export type AssistantOutcome =
  | { status: "chat"; reply: string }
  | {
      status: "entry";
      entry: AssistantEntryResult;
      stated: string[];
      clarifyQuestion: string | null;
      clarifyOptions: AssistantClarifyOption[] | null;
    }
  | { status: "unavailable" }
  | { status: "failed" };

export async function requestAssistant(
  text: string,
  dataSummary: string,
  history: { role: "user" | "assistant"; content: string }[],
  categories: string[] = [],
): Promise<AssistantOutcome> {
  try {
    const res = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, dataSummary, history, categories }),
    });
    const json = await res.json();

    if (json.usage) {
      addTokenUsage(json.usage.input_tokens ?? 0, json.usage.output_tokens ?? 0);
    }

    if (json.success && json.mode === "chat") {
      return { status: "chat", reply: json.reply as string };
    }

    if (json.success && json.mode === "entry") {
      return {
        status: "entry",
        entry: json.entry as AssistantEntryResult,
        stated: Array.isArray(json.stated) ? (json.stated as string[]) : [],
        clarifyQuestion: (json.clarifyQuestion as string | null) ?? null,
        clarifyOptions: (json.clarifyOptions as AssistantClarifyOption[] | null) ?? null,
      };
    }

    if (json.reason === "missing_api_key") {
      setApiKeyMissing(true);
      return { status: "unavailable" };
    }

    return { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
