import { createSheetCollection } from "./collection";

/**
 * Photos of products, raw materials and packaging, so every device shows the same picture.
 * Each is a small JPEG (shrunk to fit one spreadsheet cell, under 50,000 characters), keyed by
 * the item's id.
 */
export interface ItemPhoto {
  id: string;
  dataUrl: string;
  updatedAt: string;
}

export const MAX_PHOTO_CHARS = 48_000;

export const photosCollection = createSheetCollection<ItemPhoto>({
  sheetName: "Item Photos",
  header: ["id", "dataUrl", "updatedAt", "deletedAt"],
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: (p) => [p.id, p.dataUrl, p.updatedAt, ""],
  fromRow: ([id, dataUrl, updatedAt]) => (id && dataUrl?.startsWith("data:image/") ? { id, dataUrl, updatedAt: updatedAt || "" } : null),
});
