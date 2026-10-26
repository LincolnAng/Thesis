import { createSheetCollection } from "./collection";
import type { TingiMove } from "@/lib/store/types";

/** The tingi buckets: loose product put in after a batch, taken out when repacked or used. */
export const tingiCollection = createSheetCollection<TingiMove>({
  sheetName: "Tingi",
  header: ["id", "productId", "direction", "qty", "unit", "date", "lotId", "usedForProductId", "note", "loggedByName", "createdAt", "deletedAt", "runId"],
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: (t) => [t.id, t.productId, t.direction, String(t.qty), t.unit, t.date, t.lotId, t.usedForProductId ?? "", t.note, t.loggedByName ?? "", t.createdAt, "", t.runId ?? ""],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- _deletedAt is read past, not used
  fromRow: ([id, productId, direction, qty, unit, date, lotId, usedForProductId, note, loggedByName, createdAt, _deletedAt, runId]) =>
    id && productId
      ? {
          id,
          productId,
          direction: direction === "out" ? "out" : "in",
          qty: Number(qty) || 0,
          unit: unit ?? "",
          date: date ?? "",
          lotId: lotId ?? "",
          usedForProductId: usedForProductId || null,
          note: note ?? "",
          runId: runId || null,
          loggedByName: loggedByName || null,
          createdAt: createdAt || "",
        }
      : null,
});
