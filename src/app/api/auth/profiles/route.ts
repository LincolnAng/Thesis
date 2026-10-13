import { NextRequest, NextResponse } from "next/server";
import { LEGACY_PIN_COLUMNS, usersCollection, toPublicProfile, type UserRecord } from "@/lib/sheets/users";
import { isValidPin, pinColumns } from "@/lib/auth/pin";
import { readSession, requireSession, startSession } from "@/lib/auth/session";
import { PROFILE_COLORS } from "@/lib/auth/profile-colors";
import type { Role } from "@/lib/store/types";

/**
 * The profile list, Netflix-style: anyone at the device can see who has a profile (names,
 * colours, roles — never a PIN), because that is what the picker shows before sign-in.
 * Adding people, changing roles and removing profiles are an executive's job. Anyone may
 * change their own name, colour and PIN.
 */

const readRole = (raw: unknown): Role => (raw === "employee" ? "employee" : "executive");

export async function GET() {
  try {
    const users = await usersCollection.getAll();
    return NextResponse.json({ success: true, profiles: users.map(toPublicProfile) });
  } catch (err) {
    return NextResponse.json({ success: false, detail: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  let body: { name?: string; pin?: string; role?: string; color?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  if (!name) return NextResponse.json({ success: false, reason: "missing_name" }, { status: 400 });
  if (!isValidPin(pin)) return NextResponse.json({ success: false, reason: "pin_must_be_4_digits" }, { status: 400 });

  const users = await usersCollection.getAll();
  // The very first profile is how a new shop gets in at all, so it needs no sign-in — and it
  // is the owner's, so it is an executive. After that, only an executive adds people.
  const firstProfile = users.length === 0;
  if (!firstProfile) {
    const session = await readSession();
    if (!session || session.role !== "executive") {
      return NextResponse.json({ success: false, reason: "forbidden" }, { status: 403 });
    }
  }
  if (users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ success: false, reason: "name_taken" }, { status: 409 });
  }

  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: UserRecord = {
    id,
    name,
    role: firstProfile ? "executive" : readRole(body.role),
    color: PROFILE_COLORS.includes(String(body.color)) ? String(body.color) : PROFILE_COLORS[users.length % PROFILE_COLORS.length],
    hasPin: true,
    ...pinColumns(id, pin, LEGACY_PIN_COLUMNS),
    createdAt: new Date().toISOString(),
  };
  await usersCollection.append(record);
  if (firstProfile) await startSession({ userId: record.id, name: record.name, role: record.role });
  return NextResponse.json({ success: true, profile: toPublicProfile(record) });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession();
  if (auth.denied) return auth.denied;
  const { session } = auth;

  let body: { id?: string; name?: string; pin?: string; role?: string; color?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }
  const users = await usersCollection.getAll();
  const target = users.find((u) => u.id === body.id);
  if (!target) return NextResponse.json({ success: false, reason: "unknown_profile" }, { status: 404 });

  const isSelf = target.id === session.userId;
  if (!isSelf && session.role !== "executive") {
    return NextResponse.json({ success: false, reason: "forbidden" }, { status: 403 });
  }

  const next: UserRecord = { ...target };
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ success: false, reason: "missing_name" }, { status: 400 });
    next.name = name;
  }
  if (body.color !== undefined && PROFILE_COLORS.includes(String(body.color))) next.color = String(body.color);
  if (body.pin !== undefined) {
    const pin = String(body.pin).trim();
    if (!isValidPin(pin)) return NextResponse.json({ success: false, reason: "pin_must_be_4_digits" }, { status: 400 });
    Object.assign(next, pinColumns(next.id, pin, LEGACY_PIN_COLUMNS));
    next.hasPin = true;
  }
  if (body.role !== undefined) {
    if (session.role !== "executive") return NextResponse.json({ success: false, reason: "forbidden" }, { status: 403 });
    next.role = readRole(body.role);
    const executivesLeft = users.filter((u) => (u.id === next.id ? next.role : u.role) === "executive").length;
    if (executivesLeft === 0) return NextResponse.json({ success: false, reason: "last_executive" }, { status: 409 });
  }

  await usersCollection.update(next.id, next);
  // Their own name or role changed: re-issue the cookie so it says so.
  if (isSelf) await startSession({ userId: next.id, name: next.name, role: next.role });
  return NextResponse.json({ success: true, profile: toPublicProfile(next) });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSession(["executive"]);
  if (auth.denied) return auth.denied;

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }
  const users = await usersCollection.getAll();
  const target = users.find((u) => u.id === body.id);
  if (!target) return NextResponse.json({ success: true });
  if (target.role === "executive" && users.filter((u) => u.role === "executive").length === 1) {
    return NextResponse.json({ success: false, reason: "last_executive" }, { status: 409 });
  }
  await usersCollection.softDelete(target.id);
  return NextResponse.json({ success: true });
}
