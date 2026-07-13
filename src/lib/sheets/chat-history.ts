import { ensureSheetExists, getSheetValues, updateSheetValues } from "./client";
import type { ChatMessage } from "@/lib/home/chat-types";

const CHAT_SHEET = "ChatHistory";
const CHAT_HEADER = ["id", "role", "kind", "createdAt", "payload"];

function toRow(message: ChatMessage): string[] {
  const obj = message as unknown as Record<string, unknown>;
  const { id, kind, createdAt, role, ...payload } = obj;
  return [String(id), role ? String(role) : "", String(kind), String(createdAt), JSON.stringify(payload)];
}

function fromRow(row: string[]): ChatMessage | null {
  const [id, role, kind, createdAt, payloadRaw] = row;
  if (!id || id === "id") return null; // skip header / blank rows

  let payload: Record<string, unknown> = {};
  try {
    payload = payloadRaw ? JSON.parse(payloadRaw) : {};
  } catch {
    payload = {};
  }
  if (payload.deleted) return null;

  const base: Record<string, unknown> = { id, kind, createdAt, ...payload };
  if (role) base.role = role;
  return base as unknown as ChatMessage;
}

export async function getChatHistory(): Promise<ChatMessage[]> {
  const rows = await getSheetValues(`${CHAT_SHEET}!A:E`);
  return rows
    .map(fromRow)
    .filter((m): m is ChatMessage => m !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function findRowIndex(id: string): Promise<{ rows: string[][]; index: number | null }> {
  const rows = await getSheetValues(`${CHAT_SHEET}!A:E`);
  const index = rows.findIndex((row) => row[0] === id);
  return { rows, index: index === -1 ? null : index };
}

export async function appendChatMessage(message: ChatMessage): Promise<void> {
  await ensureSheetExists(CHAT_SHEET, CHAT_HEADER);
  const rows = await getSheetValues(`${CHAT_SHEET}!A:E`);
  const nextRow = rows.length + 1;
  await updateSheetValues(`${CHAT_SHEET}!A${nextRow}:E${nextRow}`, [toRow(message)]);
}

export async function updateChatMessage(id: string, message: ChatMessage): Promise<void> {
  await ensureSheetExists(CHAT_SHEET, CHAT_HEADER);
  const { rows, index } = await findRowIndex(id);
  const targetRow = index !== null ? index + 1 : rows.length + 1;
  await updateSheetValues(`${CHAT_SHEET}!A${targetRow}:E${targetRow}`, [toRow(message)]);
}

export async function deleteChatMessage(id: string): Promise<void> {
  const { index } = await findRowIndex(id);
  if (index === null) return;
  const targetRow = index + 1;
  await updateSheetValues(`${CHAT_SHEET}!E${targetRow}`, [[JSON.stringify({ deleted: true })]]);
}
