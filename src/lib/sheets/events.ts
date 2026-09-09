import { createSheetCollection } from "./collection";
import type { BusinessEvent, EventStockMovement } from "@/lib/store/types";

const EVENT_HEADER = ["id", "name", "kind", "startDate", "endDate", "status", "notes", "createdAt", "deletedAt"];

function eventToRow(e: BusinessEvent): string[] {
  return [e.id, e.name, e.kind, e.startDate ?? "", e.endDate ?? "", e.status, e.notes, e.createdAt, ""];
}

function eventFromRow(row: string[]): BusinessEvent | null {
  const [id, name, kind, startDate, endDate, status, notes, createdAt] = row;
  if (!id) return null;
  // A row whose `kind` cell isn't one of ours didn't come from this schema — an older
  // layout of this tab put a date in that column. Positional reads can't tell the two
  // apart, so rather than surface a row of shifted garbage, skip it.
  if (kind !== "event" && kind !== "distributor") return null;
  return {
    id,
    name: name ?? "",
    kind,
    startDate: startDate || null,
    endDate: endDate || null,
    status: status === "closed" ? "closed" : "open",
    notes: notes ?? "",
    createdAt: createdAt || new Date().toISOString(),
  };
}

export const eventsCollection = createSheetCollection<BusinessEvent>({
  sheetName: "Events",
  header: EVENT_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: eventToRow,
  fromRow: eventFromRow,
});

const MOVEMENT_HEADER = ["id", "eventId", "productId", "type", "quantity", "createdAt", "deletedAt"];

function movementToRow(m: EventStockMovement): string[] {
  return [m.id, m.eventId, m.productId, m.type, String(m.quantity), m.createdAt, ""];
}

function movementFromRow(row: string[]): EventStockMovement | null {
  const [id, eventId, productId, type, quantity, createdAt] = row;
  if (!id) return null;
  if (type !== "borrow" && type !== "return") return null; // see the note in eventFromRow
  return {
    id,
    eventId,
    productId,
    type,
    quantity: Number(quantity) || 0,
    createdAt: createdAt || new Date().toISOString(),
  };
}

export const eventStockCollection = createSheetCollection<EventStockMovement>({
  sheetName: "Event Stock",
  header: MOVEMENT_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: movementToRow,
  fromRow: movementFromRow,
});
