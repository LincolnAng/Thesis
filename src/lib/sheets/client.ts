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

interface SheetMeta {
  sheetId: number;
  title: string;
}

async function listSheets(): Promise<SheetMeta[]> {
  const json = await sheetsFetch("?fields=sheets.properties");
  return (json.sheets ?? []).map((s: { properties: SheetMeta }) => s.properties);
}

/** Creates the tab with a header row if it doesn't already exist, so a brand-new spreadsheet works with no manual setup. */
export async function ensureSheetExists(title: string, headerRow: string[]): Promise<void> {
  const sheets = await listSheets();
  if (sheets.some((s) => s.title === title)) return;

  await sheetsFetch(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title } } }],
    }),
  });

  await updateSheetValues(`${title}!A1`, [headerRow]);
}
