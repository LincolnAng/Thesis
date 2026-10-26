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
const KEY_MONTHLY_LIMIT = "ai_monthly_limit_php";
/** What AI cost this month, in US dollars, one row per month: "ai_spend:2026-10". */
const spendKey = (month: string) => `ai_spend:${month}`;

export type BotLanguage = "english" | "filipino" | "cebuano";
const VALID_BOT_LANGUAGES: BotLanguage[] = ["english", "filipino", "cebuano"];

export interface AiSettings {
  apiKey: string | null;
  model: string | null;
  botLanguage: BotLanguage;
  /** The most the shop will spend on AI in a month, in pesos. Null means no limit. */
  monthlyLimitPhp: number | null;
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
    monthlyLimitPhp: Number(byKey.get(KEY_MONTHLY_LIMIT)) > 0 ? Number(byKey.get(KEY_MONTHLY_LIMIT)) : null,
  };
}

export async function saveAiSettings(patch: { apiKey?: string; model?: string; botLanguage?: BotLanguage; monthlyLimitPhp?: number | null }): Promise<void> {
  clearAiSettingsCache();
  const updates: Array<[string, string]> = [];
  if (patch.apiKey !== undefined) updates.push([KEY_API_KEY, patch.apiKey]);
  if (patch.model !== undefined) updates.push([KEY_MODEL, patch.model]);
  if (patch.botLanguage !== undefined) updates.push([KEY_BOT_LANGUAGE, patch.botLanguage]);
  if (patch.monthlyLimitPhp !== undefined) updates.push([KEY_MONTHLY_LIMIT, patch.monthlyLimitPhp ? String(patch.monthlyLimitPhp) : ""]);
  // update() writes over the key's row, or adds one when there isn't one yet.
  for (const [key, value] of updates) await aiSettingsCollection.update(key, { key, value });
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

// --- This month's AI spend ------------------------------------------------------------------
// Read on every AI request to enforce the monthly limit, so it's cached briefly like the rest;
// each request adds what it cost to the cached figure straight away, so a burst of messages
// can't all slip under the limit before the next read.
const SPEND_CACHE_TTL_MS = 30_000;
let cachedSpend: { month: string; usd: number; expiresAt: number } | null = null;

export function currentMonth(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 7); // Manila
}

export async function getMonthSpendUsd(month = currentMonth()): Promise<number> {
  if (cachedSpend && cachedSpend.month === month && Date.now() < cachedSpend.expiresAt) return cachedSpend.usd;
  const row = (await aiSettingsCollection.getAll()).find((s) => s.key === spendKey(month));
  const usd = Number(row?.value) || 0;
  cachedSpend = { month, usd, expiresAt: Date.now() + SPEND_CACHE_TTL_MS };
  return usd;
}

export async function addMonthSpendUsd(usd: number, month = currentMonth()): Promise<void> {
  if (!(usd > 0)) return;
  // Read fresh so two servers adding at once lose as little as possible.
  cachedSpend = null;
  const total = (await getMonthSpendUsd(month)) + usd;
  cachedSpend = { month, usd: total, expiresAt: Date.now() + SPEND_CACHE_TTL_MS };
  await aiSettingsCollection.update(spendKey(month), { key: spendKey(month), value: total.toFixed(6) });
}
