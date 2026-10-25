import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { MAX_PHOTO_CHARS, photosCollection } from "@/lib/sheets/photos";

/**
 * Item photos for anyone signed in: GET returns them all ({ id: dataUrl }), POST saves or
 * removes one. Kept out of /api/business-data so the 30-second refresh doesn't carry images.
 */
export async function GET() {
  const auth = await requireSession();
  if (auth.denied) return auth.denied;
  try {
    const rows = await photosCollection.getAll();
    return NextResponse.json({ success: true, photos: Object.fromEntries(rows.map((r) => [r.id, r.dataUrl])) });
  } catch {
    return NextResponse.json({ success: false }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.denied) return auth.denied;
  let body: { id?: string; dataUrl?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }
  const id = String(body.id ?? "").slice(0, 80);
  if (!id) return NextResponse.json({ success: false, reason: "missing_id" }, { status: 400 });
  try {
    const existing = (await photosCollection.getAll()).find((r) => r.id === id);
    if (!body.dataUrl) {
      if (existing) await photosCollection.softDelete(id);
      return NextResponse.json({ success: true });
    }
    const dataUrl = String(body.dataUrl);
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > MAX_PHOTO_CHARS) {
      return NextResponse.json({ success: false, reason: "bad_photo" }, { status: 400 });
    }
    const row = { id, dataUrl, updatedAt: new Date().toISOString() };
    if (existing) await photosCollection.update(id, row);
    else await photosCollection.append(row);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 502 });
  }
}
