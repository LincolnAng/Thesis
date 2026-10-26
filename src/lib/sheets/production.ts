import { createSheetCollection } from "./collection";
import type { ProductionRun } from "@/lib/store/types";

/** Production runs: raw cacao roasted, usable cacao out, what went into products, what was left. */
export const productionRunsCollection = createSheetCollection<ProductionRun>({
  sheetName: "Events & Stock",
  section: "Production run",
  header: ["id", "date", "lotId", "materialId", "unit", "rawQty", "usableQty", "fromBucketQty", "intoProductsQty", "leftoverQty", "made", "notes", "loggedByName", "createdAt", "deletedAt", "name", "pelletsQty"],
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: (r) => [
    r.id,
    r.date,
    r.lotId,
    r.materialId,
    r.unit,
    String(r.rawQty),
    String(r.usableQty),
    String(r.fromBucketQty),
    String(r.intoProductsQty),
    String(r.leftoverQty),
    r.made,
    r.notes,
    r.loggedByName ?? "",
    r.createdAt,
    "",
    r.name,
    String(r.pelletsQty),
  ],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fromRow: ([id, date, lotId, materialId, unit, rawQty, usableQty, fromBucketQty, intoProductsQty, leftoverQty, made, notes, loggedByName, createdAt, _deletedAt, name, pelletsQty]) =>
    id
      ? {
          id,
          name: name ?? "",
          date: date ?? "",
          lotId: lotId ?? "",
          materialId: materialId ?? "",
          unit: unit ?? "",
          rawQty: Number(rawQty) || 0,
          usableQty: Number(usableQty) || 0,
          pelletsQty: Number(pelletsQty) || 0,
          fromBucketQty: Number(fromBucketQty) || 0,
          intoProductsQty: Number(intoProductsQty) || 0,
          leftoverQty: Number(leftoverQty) || 0,
          made: made ?? "",
          notes: notes ?? "",
          loggedByName: loggedByName || null,
          createdAt: createdAt || "",
        }
      : null,
});
