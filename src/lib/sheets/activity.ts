import { createSheetCollection } from "./collection";
import type { ActivityEvent } from "@/lib/store/types";

/**
 * Every change anyone makes, in the order it happened. Written from the one place all
 * saves pass through, so a new kind of edit can't quietly escape the log.
 */
const ACTIVITY_HEADER = ["id", "at", "userId", "userName", "action", "deletedAt"];

function activityToRow(a: ActivityEvent): string[] {
  return [a.id, a.at, a.userId, a.userName, a.action, ""];
}

function activityFromRow(row: string[]): ActivityEvent | null {
  const [id, at, userId, userName, action] = row;
  if (!id) return null;
  return {
    id,
    at: at || new Date().toISOString(),
    userId: userId ?? "",
    userName: userName ?? "Someone",
    action: action ?? "",
  };
}

export const activityCollection = createSheetCollection<ActivityEvent>({
  sheetName: "Activity",
  header: ACTIVITY_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: activityToRow,
  fromRow: activityFromRow,
});
