import { getSheetsAccessToken } from "./auth";

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

function spreadsheetId(): string {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) throw new Error("missing_google_sheets_spreadsheet_id");
  return id;
}

async function sheetsFetch(path: string, init?: RequestInit) {
  const token = await getSheetsAccessToken();
  const res = await fetch(`${SHEETS_API_BASE}/${spreadsheetId()}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sheets_api_error_${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function getSheetValues(range: string): Promise<string[][]> {
  const json = await sheetsFetch(`/values/${encodeURIComponent(range)}`);
  return json.values ?? [];
}

export async function updateSheetValues(range: string, values: string[][]): Promise<void> {
  await sheetsFetch(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
}

/**
 * Appends a row using Sheets' own append operation instead of reading the current
 * row count and writing to `count + 1` — that read-then-write pattern races when two
 * appends happen close together (both read the same count, both write the same row,
 * one silently clobbers the other). `values:append` has Sheets itself atomically pick
 * the next row per request, so concurrent appends can't collide.
 */
export async function appendSheetValues(range: string, values: string[][]): Promise<void> {
  await sheetsFetch(`/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
}

/**
 * Writes several separate, non-contiguous ranges in one HTTP call instead of one
 * `updateSheetValues` per row — used when soft-deleting every row that belongs to
 * a chat session, so removing a long conversation doesn't fire dozens of individual
 * requests and risk the same read-quota exhaustion already seen elsewhere.
 */
export async function batchUpdateValues(data: { range: string; values: string[][] }[]): Promise<void> {
  if (data.length === 0) return;
  await sheetsFetch("/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: data.map((d) => ({ range: d.range, majorDimension: "ROWS", values: d.values })),
    }),
  });
}

interface SheetMeta {
  sheetId: number;
  title: string;
}

async function listSheets(): Promise<SheetMeta[]> {
  const json = await sheetsFetch("?fields=sheets.properties");
  return (json.sheets ?? []).map((s: { properties: SheetMeta }) => s.properties);
}

async function getSheetId(title: string): Promise<number> {
  const sheets = await listSheets();
  const match = sheets.find((s) => s.title === title);
  if (!match) throw new Error(`sheet_not_found: ${title}`);
  return match.sheetId;
}

// `ensureSheetExists` runs on every read (a new tab must exist before its range can
// be queried at all) — with 8+ collections, checking `listSheets()` fresh every time
// multiplies API calls fast enough to hit Sheets' per-minute read quota under normal
// polling. Once a title's been confirmed to exist in this process, trust that and
// skip the check — tabs aren't expected to disappear mid-session.
const knownExistingSheets = new Set<string>();

/** Creates the tab with a header row if it doesn't already exist, so a brand-new spreadsheet works with no manual setup. */
export async function ensureSheetExists(title: string, headerRow: string[]): Promise<void> {
  if (knownExistingSheets.has(title)) return;

  const sheets = await listSheets();
  if (sheets.some((s) => s.title === title)) {
    knownExistingSheets.add(title);
    return;
  }

  await sheetsFetch(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title } } }],
    }),
  });

  await updateSheetValues(`${title}!A1`, [headerRow]);
  knownExistingSheets.add(title);
}

// --- Formatting (one-off presentation setup, not used by normal read/write) --------

export interface RGBColor {
  red: number;
  green: number;
  blue: number;
}

/** Runs one or more raw `batchUpdate` requests — the building block every formatting helper below is made of. */
export async function batchUpdateSpreadsheet(requests: object[]): Promise<void> {
  if (requests.length === 0) return;
  await sheetsFetch(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

export interface SheetStyleOptions {
  title: string;
  columnCount: number;
  /** Header row background; defaults to the app's cocoa-brown brand color. */
  headerColor?: RGBColor;
  /** Defaults to true. */
  freezeHeader?: boolean;
  tabColor?: RGBColor;
  numberFormats?: { columnIndex: number; pattern: string }[];
  columnWidths?: { columnIndex: number; width: number }[];
  /** Light alternating row background for readability on long tables. */
  zebraStripe?: boolean;
  /** Turns on the header filter-dropdown row. */
  filter?: boolean;
}

const DEFAULT_HEADER_COLOR: RGBColor = { red: 0.36, green: 0.23, blue: 0.13 };

/** Applies header/frozen-row/number-format/column-width/zebra/filter styling to one tab in a single batch request. */
export async function styleSheet(opts: SheetStyleOptions): Promise<void> {
  const sheetId = await getSheetId(opts.title);
  const requests: object[] = [];

  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: opts.columnCount },
      cell: {
        userEnteredFormat: {
          backgroundColor: opts.headerColor ?? DEFAULT_HEADER_COLOR,
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          verticalAlignment: "MIDDLE",
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)",
    },
  });

  const propUpdates: Record<string, unknown> = {};
  const propFields: string[] = [];
  if (opts.freezeHeader !== false) {
    propUpdates.gridProperties = { frozenRowCount: 1 };
    propFields.push("gridProperties.frozenRowCount");
  }
  if (opts.tabColor) {
    propUpdates.tabColor = opts.tabColor;
    propFields.push("tabColor");
  }
  if (propFields.length > 0) {
    requests.push({
      updateSheetProperties: { properties: { sheetId, ...propUpdates }, fields: propFields.join(",") },
    });
  }

  for (const { columnIndex, pattern } of opts.numberFormats ?? []) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern } } },
        fields: "userEnteredFormat.numberFormat",
      },
    });
  }

  for (const { columnIndex, width } of opts.columnWidths ?? []) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: columnIndex, endIndex: columnIndex + 1 },
        properties: { pixelSize: width },
        fields: "pixelSize",
      },
    });
  }

  if (opts.zebraStripe) {
    requests.push({
      addBanding: {
        bandedRange: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: opts.columnCount },
          rowProperties: {
            firstBandColor: { red: 1, green: 1, blue: 1 },
            secondBandColor: { red: 0.97, green: 0.96, blue: 0.94 },
          },
        },
      },
    });
  }

  if (opts.filter) {
    requests.push({
      setBasicFilter: {
        filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: opts.columnCount } },
      },
    });
  }

  await batchUpdateSpreadsheet(requests);
}

export async function renameSheet(oldTitle: string, newTitle: string): Promise<void> {
  const sheetId = await getSheetId(oldTitle);
  await batchUpdateSpreadsheet([{ updateSheetProperties: { properties: { sheetId, title: newTitle }, fields: "title" } }]);
}

export async function setSheetIndex(title: string, index: number): Promise<void> {
  const sheetId = await getSheetId(title);
  await batchUpdateSpreadsheet([{ updateSheetProperties: { properties: { sheetId, index }, fields: "index" } }]);
}

/** Colors an entire column's text based on exact-match rules — used to color-code the Transactions tab by entry type. */
export async function addTextColorRules(
  title: string,
  columnIndex: number,
  rules: { value: string; color: RGBColor }[],
): Promise<void> {
  const sheetId = await getSheetId(title);
  const requests = rules.map((rule) => ({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 }],
        booleanRule: {
          condition: { type: "TEXT_EQ", values: [{ userEnteredValue: rule.value }] },
          format: { textFormat: { foregroundColor: rule.color, bold: true } },
        },
      },
      index: 0,
    },
  }));
  await batchUpdateSpreadsheet(requests);
}
