import { createSheetCollection } from "./collection";
import type { ActivityEvent } from "@/lib/store/types";

/**
 * Every change anyone makes, in the order it happened. Written from the one place all
 * saves pass through, so a new kind of edit can't quietly escape the log.
 */
// Appended strictly after the original six, so rows written before undo existed still parse:
// their new cells read as empty, which is exactly what "we did not record that" should mean.
const ACTIVITY_HEADER = [
  "id",
  "at",
  "userId",
  "userName",
  "action",
  "deletedAt",
  "collection",
  "op",
  "entityId",
  "before",
  "undoneAt",
];

function activityToRow(a: ActivityEvent): string[] {
  return [
    a.id,
    a.at,
    a.userId,
    a.userName,
    a.action,
    "",
    a.collection ?? "",
    a.op ?? "",
    a.entityId ?? "",
    a.before ?? "",
    a.undoneAt ?? "",
  ];
}

function activityFromRow(row: string[]): ActivityEvent | null {
  const [id, at, userId, userName, action, , collection, op, entityId, before, undoneAt] = row;
  if (!id) return null;
  return {
    id,
    at: at || new Date().toISOString(),
    userId: userId ?? "",
    userName: userName ?? "Someone",
    action: action ?? "",
    collection: collection || undefined,
    op: op === "append" || op === "update" || op === "delete" ? op : undefined,
    entityId: entityId || undefined,
    before: before || undefined,
    undoneAt: undoneAt || undefined,
  };
}

export const activityCollection = createSheetCollection<ActivityEvent>({
  sheetName: "Logs",
  section: "Activity",
  header: ACTIVITY_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: activityToRow,
  fromRow: activityFromRow,
});
