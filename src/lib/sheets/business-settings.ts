import { createSheetCollection } from "./collection";

/**
 * Business-level numbers the owner sets once and the whole app reads — the hourly labor
 * rate today, opening balance and monthly goal later. Kept beside the rest of the business
 * data rather than in the AI Settings tab, because the cost engine needs them on every
 * render and can't wait on a server round trip.
 */
export interface BusinessSettingRow {
  key: string;
  value: string;
}

const HEADER = ["key", "value", "deletedAt"];

function toRow(r: BusinessSettingRow): string[] {
  return [r.key, r.value, ""];
}

function fromRow(row: string[]): BusinessSettingRow | null {
  const [key, value] = row;
  if (!key) return null;
  return { key, value: value ?? "" };
}

export const businessSettingsCollection = createSheetCollection<BusinessSettingRow>({
  sheetName: "Business Settings",
  header: HEADER,
  idColumn: "key",
  deletedColumn: "deletedAt",
  toRow,
  fromRow,
});
