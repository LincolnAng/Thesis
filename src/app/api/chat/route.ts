import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/ai/client";
import { chatSystemPrompt } from "@/lib/ai/prompts";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  let body: { message?: string; dataSummary?: string; history?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ success: false, reason: "empty_message" }, { status: 400 });
  }

  const history = (body.history ?? [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Owner" : "Kuya AI"}: ${m.content}`)
    .join("\n");

  const system = chatSystemPrompt(body.dataSummary ?? "No data available.");
  const prompt = history ? `${history}\nOwner: ${message}` : message;

  const result = await callClaude({ system, prompt, maxTokens: 400 });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, reason: result.error === "missing_api_key" ? "missing_api_key" : "ai_error" },
      { status: 200 },
    );
  }

  return NextResponse.json({ success: true, reply: result.text.trim(), usage: result.usage });
}
