import { batchUpdateValues, updateSheetValues } from "./client";
import { createSheetCollection } from "./collection";
import type { ChatMessage } from "@/lib/home/chat-types";

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

// Deleting a message marks its payload rather than a deletedAt column, so fromRow (null for a
// deleted one) is what keeps them out.
const chatCollection = createSheetCollection<ChatMessage>({
  sheetName: "Logs",
  section: "Chat",
  header: ["id", "role", "kind", "createdAt", "payload"],
  idColumn: "id",
  toRow,
  fromRow: (row) => fromRow(row),
});

const DELETED = [[JSON.stringify({ deleted: true })]];

export async function getChatHistory(): Promise<ChatMessage[]> {
  return (await chatCollection.getAll()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function appendChatMessage(message: ChatMessage): Promise<void> {
  await chatCollection.append(message);
}

export async function updateChatMessage(id: string, message: ChatMessage): Promise<void> {
  await chatCollection.update(id, message);
}

export async function deleteChatMessage(id: string): Promise<void> {
  const found = (await chatCollection.getRows()).find((r) => r.values[0] === id);
  if (found) await updateSheetValues(chatCollection.cellRange(found.row, "payload"), DELETED);
}

/** Soft-deletes every message belonging to one conversation in a single batched
 * write, rather than one `deleteChatMessage` call per message. */
export async function deleteChatSession(sessionId: string): Promise<void> {
  const updates: { range: string; values: string[][] }[] = [];
  for (const { values, row } of await chatCollection.getRows()) {
    const [id, , , , payloadRaw] = values;
    if (!id || id === "id") continue; // header/blank row

    let payload: Record<string, unknown> = {};
    try {
      payload = payloadRaw ? JSON.parse(payloadRaw) : {};
    } catch {
      payload = {};
    }
    if (payload.deleted || payload.sessionId !== sessionId) continue;
    updates.push({ range: chatCollection.cellRange(row, "payload"), values: DELETED });
  }
  await batchUpdateValues(updates);
}
