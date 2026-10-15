import type { AgentReply } from "@/app/api/agent/route";

export type AgentOutcome =
  | ({ status: "ok" } & Omit<AgentReply, "success">)
  | { status: "no_key" | "unreachable" | "failed" | "signed_out"; message: string };

/** Asks BAi (/api/agent) with the conversation so far. Never throws. */
export async function requestAgent(messages: { role: "user" | "assistant"; text: string }[]): Promise<AgentOutcome> {
  try {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    const json = await res.json().catch(() => null);
    if (json?.success) {
      return { status: "ok", reply: json.reply, sources: json.sources ?? [], usedWeb: Boolean(json.usedWeb), proposal: json.proposal ?? null };
    }
    const reason = json?.reason as string | undefined;
    if (reason === "no_api_key" || reason === "bad_api_key") {
      return { status: "no_key", message: "BAi isn't set up yet — an Executive needs to add the AI key under Settings → AI assistant." };
    }
    if (reason === "signed_out") return { status: "signed_out", message: "You've been signed out. Please sign in again." };
    if (reason === "busy") return { status: "unreachable", message: "BAi is busy right now. Please try again in a minute." };
    return { status: "failed", message: "Sorry, something went wrong on my side. Please try again." };
  } catch {
    return { status: "unreachable", message: "I can't reach BAi right now — check the internet connection, then try again." };
  }
}
