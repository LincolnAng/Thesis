import { ensureSheetExists, getSheetValues, updateSheetValues } from "./client";

const SETTINGS_SHEET = "Settings";
const SETTINGS_HEADER = ["key", "value"];
const KEY_API_KEY = "anthropic_api_key";
const KEY_MODEL = "anthropic_model";

export interface AiSettings {
  apiKey: string | null;
  model: string | null;
}

export async function getAiSettings(): Promise<AiSettings> {
  const rows = await getSheetValues(`${SETTINGS_SHEET}!A:B`);
  const byKey = new Map<string, string>();
  for (const [key, value] of rows) {
    if (key) byKey.set(key, value ?? "");
  }
  return {
    apiKey: byKey.get(KEY_API_KEY)?.trim() || null,
    model: byKey.get(KEY_MODEL)?.trim() || null,
  };
}

export async function saveAiSettings(patch: { apiKey?: string; model?: string }): Promise<void> {
  await ensureSheetExists(SETTINGS_SHEET, SETTINGS_HEADER);
  const rows = await getSheetValues(`${SETTINGS_SHEET}!A:B`);

  const rowIndexByKey = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row[0]) rowIndexByKey.set(row[0], index + 1); // sheet rows are 1-indexed
  });

  const updates: Array<[string, string]> = [];
  if (patch.apiKey !== undefined) updates.push([KEY_API_KEY, patch.apiKey]);
  if (patch.model !== undefined) updates.push([KEY_MODEL, patch.model]);

  for (const [key, value] of updates) {
    const existingRow = rowIndexByKey.get(key);
    const targetRow = existingRow ?? rows.length + 1;
    await updateSheetValues(`${SETTINGS_SHEET}!A${targetRow}:B${targetRow}`, [[key, value]]);
    if (!existingRow) {
      rows.push([key, value]);
      rowIndexByKey.set(key, targetRow);
    }
  }
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}
