import { createSheetCollection } from "./collection";

/**
 * What BAi has learned about each person — how they like answers, nicknames, a regular buyer's
 * habits — saved when they say something worth keeping, and read back into every conversation
 * with them. Server only: never sent to any screen, and one person's notes never reach another.
 */
export interface AiMemoryNote {
  id: string;
  userId: string;
  note: string;
  createdAt: string;
}

export const aiMemoryCollection = createSheetCollection<AiMemoryNote>({
  sheetName: "AI Memory",
  header: ["id", "userId", "note", "createdAt", "deletedAt"],
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: (n) => [n.id, n.userId, n.note, n.createdAt, ""],
  fromRow: ([id, userId, note, createdAt]) => (id && userId && note ? { id, userId, note, createdAt: createdAt || "" } : null),
});

/** At most this many notes per person are kept in play — the newest. */
export const MAX_NOTES = 40;
