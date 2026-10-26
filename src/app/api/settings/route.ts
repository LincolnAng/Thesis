import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getAiSettings, getMonthSpendUsd, maskApiKey, saveAiSettings, type BotLanguage } from "@/lib/sheets/settings";
import { PHP_PER_USD } from "@/lib/ai/spend";

const VALID_BOT_LANGUAGES: BotLanguage[] = ["english", "filipino", "cebuano"];

export async function GET() {
  const auth = await requireSession(["executive"]);
  if (auth.denied) return auth.denied;
  try {
    const settings = await getAiSettings();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    return NextResponse.json({
      success: true,
      hasKey: !!settings.apiKey,
      keyPreview: settings.apiKey ? maskApiKey(settings.apiKey) : null,
      model: settings.model,
      botLanguage: settings.botLanguage,
      monthlyLimitPhp: settings.monthlyLimitPhp,
      spentThisMonthPhp: Math.round((await getMonthSpendUsd()) * PHP_PER_USD * 100) / 100,
      spreadsheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : null,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      reason: "sheets_unavailable",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(["executive"]);
  if (auth.denied) return auth.denied;
  let body: { apiKey?: string; model?: string; botLanguage?: string; monthlyLimitPhp?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim();
  const model = body.model?.trim();
  const botLanguage = body.botLanguage?.trim();
  // A number of pesos, or null / 0 for no limit.
  const limit = body.monthlyLimitPhp === undefined ? undefined : Number(body.monthlyLimitPhp) > 0 ? Math.round(Number(body.monthlyLimitPhp)) : null;
  if (apiKey === undefined && model === undefined && botLanguage === undefined && limit === undefined) {
    return NextResponse.json({ success: false, reason: "nothing_to_save" }, { status: 400 });
  }
  if (apiKey === "" || model === "") {
    return NextResponse.json({ success: false, reason: "empty_value" }, { status: 400 });
  }
  if (botLanguage !== undefined && !VALID_BOT_LANGUAGES.includes(botLanguage as BotLanguage)) {
    return NextResponse.json({ success: false, reason: "invalid_bot_language" }, { status: 400 });
  }

  try {
    await saveAiSettings({ apiKey, model, botLanguage: botLanguage as BotLanguage | undefined, monthlyLimitPhp: limit });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, reason: "sheets_unavailable", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
