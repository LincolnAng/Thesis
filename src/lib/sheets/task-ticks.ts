import { createSheetCollection } from "./collection";
import type { TaskTick } from "@/lib/store/types";

/** Tasks on Today at a glance crossed out for the day — who crossed out what, shared by everyone. */
export const taskTicksCollection = createSheetCollection<TaskTick>({
  sheetName: "Logs",
  section: "Task done",
  header: ["id", "taskId", "day", "title", "userId", "userName", "createdAt", "deletedAt"],
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: (t) => [t.id, t.taskId, t.day, t.title, t.userId, t.userName, t.createdAt, ""],
  fromRow: ([id, taskId, day, title, userId, userName, createdAt]) =>
    id && taskId && day
      ? { id, taskId, day, title: title ?? "", userId: userId ?? "", userName: userName ?? "", createdAt: createdAt || "" }
      : null,
});
