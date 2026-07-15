import { NextRequest, NextResponse } from "next/server";
import { appendChatMessage, deleteChatMessage, deleteChatSession, getChatHistory, updateChatMessage } from "@/lib/sheets/chat-history";
import type { ChatMessage } from "@/lib/home/chat-types";

export async function GET() {
  try {
    const messages = await getChatHistory();
    return NextResponse.json({ success: true, messages });
  } catch (err) {
    return NextResponse.json({ success: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

export async function POST(req: NextRequest) {
  let body: { message?: ChatMessage };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }
  if (!body.message) {
    return NextResponse.json({ success: false, reason: "missing_message" }, { status: 400 });
  }
  try {
    await appendChatMessage(body.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  let body: { id?: string; message?: ChatMessage };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }
  if (!body.id || !body.message) {
    return NextResponse.json({ success: false, reason: "missing_fields" }, { status: 400 });
  }
  try {
    await updateChatMessage(body.id, body.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  let body: { id?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }
  if (!body.id && !body.sessionId) {
    return NextResponse.json({ success: false, reason: "missing_id" }, { status: 400 });
  }
  try {
    if (body.sessionId) {
      await deleteChatSession(body.sessionId);
    } else if (body.id) {
      await deleteChatMessage(body.id);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
