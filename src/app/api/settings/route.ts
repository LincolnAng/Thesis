import { NextRequest, NextResponse } from "next/server";
import { getAiSettings, maskApiKey, saveAiSettings } from "@/lib/sheets/settings";

export async function GET() {
  try {
    const settings = await getAiSettings();
    return NextResponse.json({
      success: true,
      hasKey: !!settings.apiKey,
      keyPreview: settings.apiKey ? maskApiKey(settings.apiKey) : null,
      model: settings.model,
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
  let body: { apiKey?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim();
  const model = body.model?.trim();
  if (apiKey === undefined && model === undefined) {
    return NextResponse.json({ success: false, reason: "nothing_to_save" }, { status: 400 });
  }
  if (apiKey === "" || model === "") {
    return NextResponse.json({ success: false, reason: "empty_value" }, { status: 400 });
  }

  try {
    await saveAiSettings({ apiKey, model });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, reason: "sheets_unavailable", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
