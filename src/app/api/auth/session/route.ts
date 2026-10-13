import { NextRequest, NextResponse } from "next/server";
import { LEGACY_PIN_COLUMNS, usersCollection, toPublicProfile } from "@/lib/sheets/users";
import { hashPin, isValidPin, verifyPin } from "@/lib/auth/pin";
import { endSession, readSession, startSession } from "@/lib/auth/session";

/**
 * Signing in and out. GET says who this browser is signed in as (the profile, fresh from the
 * sheet, or null); POST checks a PIN and starts a session; DELETE ends it.
 */

// Four digits fall to a patient guesser, so slow one down. Per server instance only — this is
// a speed bump in keeping with what a PIN is, not a lock.
const failures = new Map<string, { count: number; until: number }>();
const MAX_TRIES = 5;
const LOCK_MS = 60_000;

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ success: true, user: null });
  try {
    const user = (await usersCollection.getAll()).find((u) => u.id === session.userId);
    if (!user) {
      await endSession();
      return NextResponse.json({ success: true, user: null });
    }
    return NextResponse.json({ success: true, user: toPublicProfile(user) });
  } catch {
    // Sheets unreachable: trust the signed cookie rather than locking everyone out.
    return NextResponse.json({
      success: true,
      user: { id: session.userId, name: session.name, role: session.role, color: "", hasPin: true, createdAt: "" },
    });
  }
}

export async function POST(req: NextRequest) {
  let body: { userId?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }
  const userId = String(body.userId ?? "");
  const pin = String(body.pin ?? "").trim();

  const lock = failures.get(userId);
  if (lock && lock.until > Date.now()) {
    return NextResponse.json({ success: false, reason: "locked", retryInSeconds: Math.ceil((lock.until - Date.now()) / 1000) }, { status: 429 });
  }

  const user = (await usersCollection.getAll()).find((u) => u.id === userId);
  if (!user) return NextResponse.json({ success: false, reason: "unknown_profile" }, { status: 404 });

  const { ok, upgrade } = verifyPin(user, pin);
  if (!ok) {
    const count = (lock?.count ?? 0) + 1;
    failures.set(userId, count >= MAX_TRIES ? { count: 0, until: Date.now() + LOCK_MS } : { count, until: 0 });
    return NextResponse.json({ success: false, reason: "wrong_pin" }, { status: 401 });
  }
  failures.delete(userId);

  // No scrypt hash yet (digits typed into the sheet, or the old browser-made hash): add one now
  // that we know the PIN. The legacy columns are left as they are while the live site still
  // reads them — see TRANSITION in sheets/users.ts.
  if (upgrade && isValidPin(pin)) {
    try {
      await usersCollection.update(user.id, {
        ...user,
        pinSecure: hashPin(pin),
        ...(LEGACY_PIN_COLUMNS ? {} : { pinHash: "", pin: "" }),
      });
    } catch {
      // Not fatal — they're in, and the next sign-in tries again.
    }
  }

  await startSession({ userId: user.id, name: user.name, role: user.role });
  return NextResponse.json({ success: true, user: toPublicProfile(user) });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ success: true });
}
