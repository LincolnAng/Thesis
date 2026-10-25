import { createSheetCollection } from "./collection";
import type { AgendaKind, AgendaVisibility, CalendarItem } from "@/lib/store/types";

const KINDS: AgendaKind[] = ["event", "task", "meeting", "delivery", "receivable", "payable", "reminder"];
const VIS: AgendaVisibility[] = ["private", "everyone", "people"];

/** What people put on the calendar themselves. Who sees which is decided in lib/auth/permissions. */
export const calendarItemsCollection = createSheetCollection<CalendarItem>({
  sheetName: "Calendar Items",
  header: ["id", "title", "kind", "date", "endDate", "startTime", "endTime", "location", "notes", "ownerId", "ownerName", "visibility", "sharedWith", "done", "createdAt", "deletedAt"],
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: (c) => [c.id, c.title, c.kind, c.date, c.endDate ?? "", c.startTime ?? "", c.endTime ?? "", c.location ?? "", c.notes ?? "", c.ownerId, c.ownerName, c.visibility, (c.sharedWith ?? []).join(","), c.done ? "yes" : "", c.createdAt, ""],
  fromRow: ([id, title, kind, date, endDate, startTime, endTime, location, notes, ownerId, ownerName, visibility, sharedWith, done, createdAt]) =>
    id && date
      ? {
          id,
          title: title ?? "",
          kind: KINDS.includes(kind as AgendaKind) ? (kind as AgendaKind) : "event",
          date,
          endDate: endDate || null,
          startTime: startTime || null,
          endTime: endTime || null,
          location: location ?? "",
          notes: notes ?? "",
          ownerId: ownerId ?? "",
          ownerName: ownerName ?? "",
          visibility: VIS.includes(visibility as AgendaVisibility) ? (visibility as AgendaVisibility) : "private",
          sharedWith: (sharedWith ?? "").split(",").map((s) => s.trim()).filter(Boolean),
          done: done === "yes",
          createdAt: createdAt || new Date().toISOString(),
        }
      : null,
});
