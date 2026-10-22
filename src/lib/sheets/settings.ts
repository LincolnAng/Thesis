import { createSheetCollection } from "./collection";

// Kept apart from the shop's own settings ("Setting" rows) by section: those go to every
// device, and this one holds the API key, which must not.
const aiSettingsCollection = createSheetCollection<{ key: string; value: string }>({
  sheetName: "Shop Setup",
  section: "AI setting",
  header: ["key", "value", "deletedAt"],
  idColumn: "key",
  deletedColumn: "deletedAt",
  toRow: (s) => [s.key, s.value, ""],
  fromRow: (row) => ({ key: row[0], value: row[1] ?? "" }),
});
const KEY_API_KEY = "anthropic_api_key";
const KEY_MODEL = "anthropic_model";
const KEY_BOT_LANGUAGE = "bot_language";

export type BotLanguage = "english" | "filipino" | "cebuano";
const VALID_BOT_LANGUAGES: BotLanguage[] = ["english", "filipino", "cebuano"];

export interface AiSettings {
  apiKey: string | null;
  model: string | null;
  botLanguage: BotLanguage;
}

// These settings (API key, model, bot language) change maybe a handful of times ever, but
// they were being read from Sheets on the hot path of every single chat message — a full
// HTTP round trip to Google before the Anthropic request could even start. Caching them in
// module scope for a short window removes that from nearly every request; saveAiSettings()
// below clears it immediately so a change still takes effect right away.
const SETTINGS_CACHE_TTL_MS = 60_000;
let cachedSettings: { value: AiSettings; expiresAt: number } | null = null;

export function clearAiSettingsCache(): void {
  cachedSettings = null;
}

export async function getAiSettings(): Promise<AiSettings> {
  if (cachedSettings && Date.now() < cachedSettings.expiresAt) return cachedSettings.value;
  const settings = await readAiSettings();
  cachedSettings = { value: settings, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
  return settings;
}

async function readAiSettings(): Promise<AiSettings> {
  const byKey = new Map((await aiSettingsCollection.getAll()).map((s) => [s.key, s.value]));
  const storedLanguage = byKey.get(KEY_BOT_LANGUAGE)?.trim();
  return {
    apiKey: byKey.get(KEY_API_KEY)?.trim() || null,
    model: byKey.get(KEY_MODEL)?.trim() || null,
    botLanguage: VALID_BOT_LANGUAGES.includes(storedLanguage as BotLanguage) ? (storedLanguage as BotLanguage) : "english",
  };
}

export async function saveAiSettings(patch: { apiKey?: string; model?: string; botLanguage?: BotLanguage }): Promise<void> {
  clearAiSettingsCache();
  const updates: Array<[string, string]> = [];
  if (patch.apiKey !== undefined) updates.push([KEY_API_KEY, patch.apiKey]);
  if (patch.model !== undefined) updates.push([KEY_MODEL, patch.model]);
  if (patch.botLanguage !== undefined) updates.push([KEY_BOT_LANGUAGE, patch.botLanguage]);
  // update() writes over the key's row, or adds one when there isn't one yet.
  for (const [key, value] of updates) await aiSettingsCollection.update(key, { key, value });
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}
