import { createSheetCollection } from "./collection";
import type { Event } from "@/lib/store/types";

const EVENT_HEADER = ["id", "name", "startDate", "endDate", "notes", "deletedAt"];

function eventToRow(e: Event): string[] {
  return [e.id, e.name, e.startDate, e.endDate, e.notes, ""];
}

function eventFromRow(row: string[]): Event | null {
  const [id, name, startDate, endDate, notes] = row;
  if (!id) return null;
  return { id, name: name ?? "", startDate: startDate ?? "", endDate: endDate ?? "", notes: notes ?? "" };
}

export const eventsCollection = createSheetCollection<Event>({
  sheetName: "Events",
  header: EVENT_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: eventToRow,
  fromRow: eventFromRow,
});
