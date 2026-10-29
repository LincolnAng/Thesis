import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { aiUsageCollection } from "@/lib/sheets/ai-usage";
import { currentMonth, getMonthSpendUsd, listMonthSpendUsd } from "@/lib/sheets/settings";
import { PHP_PER_USD } from "@/lib/ai/spend";
import { summarizeAiUse } from "@/lib/ai/usage-summary";

/**
 * The AI costs tab (Executives only): one month's AI spend broken down by feature, person, model
 * and day, its costliest and latest prompts, and every month's total so far.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSession(["executive"]);
  if (auth.denied) return auth.denied;
  const asked = req.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) ? asked : currentMonth();
  try {
    const [rows, recordedUsd, months] = await Promise.all([aiUsageCollection.getAll(), getMonthSpendUsd(month), listMonthSpendUsd()]);
    return NextResponse.json({
      success: true,
      phpPerUsd: PHP_PER_USD,
      currentMonth: currentMonth(),
      summary: summarizeAiUse(rows, month, recordedUsd),
      months,
    });
  } catch (err) {
    return NextResponse.json({ success: false, reason: "sheets_unavailable", detail: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
