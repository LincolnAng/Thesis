import { createSheetCollection } from "./collection";
import type { CacaoMove, ProductionRun } from "@/lib/store/types";

/** Production runs: raw cacao roasted, usable cacao out, what went into products, what was left. */
export const productionRunsCollection = createSheetCollection<ProductionRun>({
  sheetName: "Events & Stock",
  section: "Production run",
  header: ["id", "date", "lotId", "materialId", "unit", "rawQty", "usableQty", "fromBucketQty", "intoProductsQty", "leftoverQty", "made", "notes", "loggedByName", "createdAt", "deletedAt"],
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
  ],
  fromRow: ([id, date, lotId, materialId, unit, rawQty, usableQty, fromBucketQty, intoProductsQty, leftoverQty, made, notes, loggedByName, createdAt]) =>
    id
      ? {
          id,
          date: date ?? "",
          lotId: lotId ?? "",
          materialId: materialId ?? "",
          unit: unit ?? "",
          rawQty: Number(rawQty) || 0,
          usableQty: Number(usableQty) || 0,
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

/** The leftover cacao bucket: every time usable cacao went in or came out, and why. */
export const cacaoBucketCollection = createSheetCollection<CacaoMove>({
  sheetName: "Events & Stock",
  section: "Cacao bucket",
  header: ["id", "materialId", "direction", "quantity", "unit", "date", "runId", "purpose", "loggedByName", "createdAt", "deletedAt"],
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: (m) => [m.id, m.materialId, m.direction, String(m.qty), m.unit, m.date, m.runId ?? "", m.purpose, m.loggedByName ?? "", m.createdAt, ""],
  fromRow: ([id, materialId, direction, qty, unit, date, runId, purpose, loggedByName, createdAt]) =>
    id
      ? {
          id,
          materialId: materialId ?? "",
          direction: direction === "out" ? "out" : "in",
          qty: Number(qty) || 0,
          unit: unit ?? "",
          date: date ?? "",
          runId: runId || null,
          purpose: purpose ?? "",
          loggedByName: loggedByName || null,
          createdAt: createdAt || "",
        }
      : null,
});
