import { appendSheetValues, ensureSheetExists, getSheetValues, updateSheetValues } from "./client";

export interface SheetCollection<T> {
  getAll(): Promise<T[]>;
  append(item: T): Promise<void>;
  appendMany(items: T[]): Promise<void>;
  update(id: string, item: T): Promise<void>;
  softDelete(id: string): Promise<void>;
}

interface CollectionConfig<T> {
  sheetName: string;
  header: string[];
  idColumn: string; // must be one of `header`
  toRow(item: T): string[];
  fromRow(row: string[]): T | null;
  /** If set, delete marks this column instead of removing the row — must be one of `header`. */
  deletedColumn?: string;
}

// Every collection in this app fits well under 26 columns.
function columnLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * A reusable Sheets-backed collection: flat, human-readable columns (one named
 * field per column, no JSON blobs), built entirely on the existing primitives in
 * ./client.ts — including the atomic `appendSheetValues` that avoids the
 * read-count-then-write race a plain `updateSheetValues(rows.length+1, ...)`
 * pattern would reintroduce.
 */
export function createSheetCollection<T>(config: CollectionConfig<T>): SheetCollection<T> {
  const { sheetName, header, idColumn, toRow, fromRow, deletedColumn } = config;
  const lastCol = columnLetter(header.length - 1);
  const range = `${sheetName}!A:${lastCol}`;
  const idIndex = header.indexOf(idColumn);
  const deletedIndex = deletedColumn ? header.indexOf(deletedColumn) : -1;

  async function ensureExists(): Promise<void> {
    await ensureSheetExists(sheetName, header);
  }

  async function getAllRows(): Promise<string[][]> {
    return getSheetValues(range);
  }

  async function getAll(): Promise<T[]> {
    const rows = await getAllRows();
    const items: T[] = [];
    for (const row of rows) {
      if (!row[idIndex] || row[idIndex] === idColumn) continue; // skip header/blank rows
      if (deletedIndex >= 0 && row[deletedIndex]) continue; // soft-deleted
      const item = fromRow(row);
      if (item) items.push(item);
    }
    return items;
  }

  async function findRowIndex(id: string): Promise<number | null> {
    const rows = await getAllRows();
    const index = rows.findIndex((row) => row[idIndex] === id);
    return index === -1 ? null : index;
  }

  async function append(item: T): Promise<void> {
    await ensureExists();
    await appendSheetValues(range, [toRow(item)]);
  }

  async function appendMany(items: T[]): Promise<void> {
    if (items.length === 0) return;
    await ensureExists();
    await appendSheetValues(range, items.map(toRow));
  }

  async function update(id: string, item: T): Promise<void> {
    await ensureExists();
    const index = await findRowIndex(id);
    if (index !== null) {
      const targetRow = index + 1;
      await updateSheetValues(`${sheetName}!A${targetRow}:${lastCol}${targetRow}`, [toRow(item)]);
    } else {
      // Its original append may not have landed yet — append rather than guess a row.
      await appendSheetValues(range, [toRow(item)]);
    }
  }

  async function softDelete(id: string): Promise<void> {
    if (deletedIndex < 0) throw new Error(`${sheetName}: softDelete requires a deletedColumn`);
    const index = await findRowIndex(id);
    if (index === null) return;
    const targetRow = index + 1;
    const deletedColLetter = columnLetter(deletedIndex);
    await updateSheetValues(`${sheetName}!${deletedColLetter}${targetRow}`, [[new Date().toISOString()]]);
  }

  return { getAll, append, appendMany, update, softDelete };
}
