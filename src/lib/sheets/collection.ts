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

/** Spreadsheet column name for a zero-based index: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
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

  let headerChecked = false;

  async function ensureExists(): Promise<void> {
    await ensureSheetExists(sheetName, header);
    if (headerChecked) return;
    headerChecked = true;
    // A tab created before a column was added keeps its old, shorter header row, so the new
    // column fills with values under a blank title. Name it — but only when every existing
    // title matches, so a tab someone rearranged by hand is never relabelled.
    const [current = []] = await getSheetValues(`${sheetName}!A1:${lastCol}1`);
    const matchesSoFar = current.every((cell, i) => cell === header[i]);
    if (current.length > 0 && current.length < header.length && matchesSoFar) {
      await updateSheetValues(`${sheetName}!A1:${lastCol}1`, [header]);
    }
  }

  async function getAllRows(): Promise<string[][]> {
    await ensureExists(); // a brand-new tab that doesn't exist yet fails the range lookup outright
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
