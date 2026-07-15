import { NextRequest, NextResponse } from "next/server";
import { getAiSettings, maskApiKey, saveAiSettings, type BotLanguage } from "@/lib/sheets/settings";

const VALID_BOT_LANGUAGES: BotLanguage[] = ["english", "filipino", "cebuano"];

export async function GET() {
  try {
    const settings = await getAiSettings();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    return NextResponse.json({
      success: true,
      hasKey: !!settings.apiKey,
      keyPreview: settings.apiKey ? maskApiKey(settings.apiKey) : null,
      model: settings.model,
      botLanguage: settings.botLanguage,
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
  let body: { apiKey?: string; model?: string; botLanguage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim();
  const model = body.model?.trim();
  const botLanguage = body.botLanguage?.trim();
  if (apiKey === undefined && model === undefined && botLanguage === undefined) {
    return NextResponse.json({ success: false, reason: "nothing_to_save" }, { status: 400 });
  }
  if (apiKey === "" || model === "") {
    return NextResponse.json({ success: false, reason: "empty_value" }, { status: 400 });
  }
  if (botLanguage !== undefined && !VALID_BOT_LANGUAGES.includes(botLanguage as BotLanguage)) {
    return NextResponse.json({ success: false, reason: "invalid_bot_language" }, { status: 400 });
  }

  try {
    await saveAiSettings({ apiKey, model, botLanguage: botLanguage as BotLanguage | undefined });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, reason: "sheets_unavailable", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
