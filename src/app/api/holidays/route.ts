import { NextRequest, NextResponse } from "next/server";
import { fixedHolidays, type Holiday } from "@/lib/calendar/holidays";

/**
 * Official Philippine holidays for a year, from the public Nager.Date holiday service (no key,
 * nothing about the shop is sent). Cached for a day; if the service can't be reached, the
 * fixed-date holidays are returned so the calendar still shows the big ones.
 */
export async function GET(req: NextRequest) {
  const year = Number(req.nextUrl.searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return NextResponse.json({ success: false, reason: "bad_year" }, { status: 400 });
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PH`, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const raw = (await res.json()) as { date: string; name: string; localName: string }[];
    const holidays: Holiday[] = raw.filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date)).map((h) => ({ date: h.date, name: h.name, localName: h.localName }));
    return NextResponse.json({ success: true, source: "official", holidays }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch {
    return NextResponse.json({ success: true, source: "fixed", holidays: fixedHolidays(year) });
  }
}
