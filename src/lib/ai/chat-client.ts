import { addTokenUsage, setApiKeyMissing } from "@/lib/store/store";

export type ChatOutcome =
  | { status: "success"; reply: string }
  | { status: "unavailable" }
  | { status: "failed" };

export async function requestChat(
  message: string,
  dataSummary: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<ChatOutcome> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, dataSummary, history }),
    });
    const json = await res.json();

    if (json.usage) {
      addTokenUsage(json.usage.input_tokens ?? 0, json.usage.output_tokens ?? 0);
    }

    if (json.success) {
      return { status: "success", reply: json.reply as string };
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
