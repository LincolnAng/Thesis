import { appendSheetValues, ensureSheetExists, getSheetValues, updateSheetValues } from "./client";
import { SHARED_TABS } from "./layout";

export interface SheetCollection<T> {
  getAll(): Promise<T[]>;
  append(item: T): Promise<void>;
  appendMany(items: T[]): Promise<void>;
  update(id: string, item: T): Promise<void>;
  softDelete(id: string): Promise<void>;
  /** This collection's rows as stored, in its own column order, with each one's sheet row (1-based). */
  getRows(): Promise<{ values: string[]; row: number }[]>;
  /** The A1 range of one of this collection's cells on a given sheet row. */
  cellRange(row: number, column: string): string;
}

interface CollectionConfig<T> {
  sheetName: string;
  /** Set when the tab is shared with other kinds of record (see ./layout): what this kind is called in its "section" column. */
  section?: string;
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
  const { sheetName, section, header, idColumn, toRow, fromRow, deletedColumn } = config;
  // The tab's own columns: this collection's, or — on a shared tab — every kind's together.
  const tabHeader = section ? SHARED_TABS[sheetName] : header;
  if (!tabHeader) throw new Error(`${sheetName}: not a shared tab in sheets/layout`);
  // Where each of this collection's columns sits on the tab, found by name.
  const at = header.map((name) => {
    const i = tabHeader.indexOf(name);
    if (i < 0) throw new Error(`${sheetName}: column "${name}" is missing from sheets/layout`);
    return i;
  });
  const lastCol = columnLetter(tabHeader.length - 1);
  // Quoted, so a tab name with spaces or "&" reads as one name.
  const tab = `'${sheetName.replace(/'/g, "''")}'`;
  const range = `${tab}!A:${lastCol}`;
  const idIndex = header.indexOf(idColumn);
  const deletedIndex = deletedColumn ? header.indexOf(deletedColumn) : -1;

  const mine = (row: string[]) => !section || row[0] === section;
  const fromTab = (row: string[]) => (section ? at.map((i) => row[i]) : row);
  const toTab = (own: string[]) => {
    if (!section) return own;
    const row = tabHeader.map(() => "");
    row[0] = section;
    own.forEach((value, i) => (row[at[i]] = value));
    return row;
  };

  let headerChecked = false;

  async function ensureExists(): Promise<void> {
    await ensureSheetExists(sheetName, tabHeader);
    if (headerChecked) return;
    headerChecked = true;
    // A tab created before a column was added keeps its old, shorter header row, so the new
    // column fills with values under a blank title. Name it — but only when every existing
    // title matches, so a tab someone rearranged by hand is never relabelled.
    const [current = []] = await getSheetValues(`${tab}!A1:${lastCol}1`);
    const matchesSoFar = current.every((cell, i) => cell === tabHeader[i]);
    if (current.length > 0 && current.length < tabHeader.length && matchesSoFar) {
      await updateSheetValues(`${tab}!A1:${lastCol}1`, [tabHeader]);
    }
  }

  async function getRows(): Promise<{ values: string[]; row: number }[]> {
    await ensureExists(); // a brand-new tab that doesn't exist yet fails the range lookup outright
    const rows = await getSheetValues(range);
    const out: { values: string[]; row: number }[] = [];
    rows.forEach((row, index) => {
      if (mine(row)) out.push({ values: fromTab(row), row: index + 1 });
    });
    return out;
  }

  async function getAll(): Promise<T[]> {
    const items: T[] = [];
    for (const { values: row } of await getRows()) {
      if (!row[idIndex] || row[idIndex] === idColumn) continue; // skip header/blank rows
      if (deletedIndex >= 0 && row[deletedIndex]) continue; // soft-deleted
      const item = fromRow(row);
      if (item) items.push(item);
    }
    return items;
  }

  async function findRow(id: string): Promise<number | null> {
    return (await getRows()).find((r) => r.values[idIndex] === id)?.row ?? null;
  }

  function cellRange(row: number, column: string): string {
    const i = header.indexOf(column);
    if (i < 0) throw new Error(`${sheetName}: no column "${column}"`);
    return `${tab}!${columnLetter(at[i])}${row}`;
  }

  async function append(item: T): Promise<void> {
    await ensureExists();
    await appendSheetValues(range, [toTab(toRow(item))]);
  }

  async function appendMany(items: T[]): Promise<void> {
    if (items.length === 0) return;
    await ensureExists();
    await appendSheetValues(range, items.map((item) => toTab(toRow(item))));
  }

  async function update(id: string, item: T): Promise<void> {
    await ensureExists();
    const row = await findRow(id);
    if (row !== null) {
      await updateSheetValues(`${tab}!A${row}:${lastCol}${row}`, [toTab(toRow(item))]);
    } else {
      // Its original append may not have landed yet — append rather than guess a row.
      await appendSheetValues(range, [toTab(toRow(item))]);
    }
  }

  async function softDelete(id: string): Promise<void> {
    if (!deletedColumn) throw new Error(`${sheetName}: softDelete requires a deletedColumn`);
    const row = await findRow(id);
    if (row === null) return;
    await updateSheetValues(cellRange(row, deletedColumn), [[new Date().toISOString()]]);
  }

  return { getAll, append, appendMany, update, softDelete, getRows, cellRange };
}
