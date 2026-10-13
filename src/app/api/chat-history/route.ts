import { NextRequest, NextResponse } from "next/server";
import { appendChatMessage, deleteChatMessage, deleteChatSession, getChatHistory, updateChatMessage } from "@/lib/sheets/chat-history";
import type { ChatMessage } from "@/lib/home/chat-types";
import { requireSession, type Session } from "@/lib/auth/session";

/**
 * Each profile's chats are their own. Messages carry the owner's id (stamped here, not by the
 * browser); chats from before profiles had roles have no owner and stay with the executives.
 */
function ownedBy(message: ChatMessage, session: Session): boolean {
  const owner = (message as { ownerId?: string }).ownerId;
  return owner ? owner === session.userId : session.role === "executive";
}

async function canTouch(session: Session, target: { id?: string; sessionId?: string }): Promise<boolean> {
  const all = await getChatHistory();
  const hits = all.filter((m) =>
    target.sessionId ? (m as { sessionId?: string }).sessionId === target.sessionId : m.id === target.id,
  );
  return hits.every((m) => ownedBy(m, session));
}

export async function GET() {
  const auth = await requireSession();
  if (auth.denied) return auth.denied;
  try {
    const messages = (await getChatHistory()).filter((m) => ownedBy(m, auth.session));
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
  const auth = await requireSession();
  if (auth.denied) return auth.denied;
  try {
    await appendChatMessage({ ...body.message, ownerId: auth.session.userId } as unknown as ChatMessage);
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
  const auth = await requireSession();
  if (auth.denied) return auth.denied;
  try {
    if (!(await canTouch(auth.session, { id: body.id }))) {
      return NextResponse.json({ success: false, reason: "forbidden" }, { status: 403 });
    }
    await updateChatMessage(body.id, { ...body.message, ownerId: auth.session.userId } as unknown as ChatMessage);
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
  const auth = await requireSession();
  if (auth.denied) return auth.denied;
  try {
    if (!(await canTouch(auth.session, body))) {
      return NextResponse.json({ success: false, reason: "forbidden" }, { status: 403 });
    }
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
