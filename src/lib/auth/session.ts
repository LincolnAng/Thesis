import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Role } from "@/lib/store/types";

/**
 * Who is signed in, as the server knows it — server only.
 *
 * A signed cookie rather than the browser's say-so: until this existed the server served every
 * row to anyone who asked, and "employee" could only ever have meant "a screen we didn't show".
 * The cookie carries the profile id, name and role, signed with HMAC so it can't be edited into
 * an executive one. httpOnly, so page scripts can't read it either.
 */

export interface Session {
  userId: string;
  name: string;
  role: Role;
}

const COOKIE = "mk_session";
// A shared tablet stays signed in until someone switches, as it always has — but not forever.
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function secret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  // No separate secret to set up on Vercel: the service-account key is already a server-only
  // secret, so a key derived from it is one too. Rotating that key signs everyone out, which
  // is the right side to fail on.
  const derivedFrom = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (derivedFrom) return createHash("sha256").update(`mk-session:${derivedFrom}`).digest("hex");
  if (process.env.NODE_ENV !== "production") return "mk-session-local-dev-only";
  throw new Error("No AUTH_SECRET or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY set — sessions can't be signed.");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encode(session: Session): string {
  const payload = Buffer.from(
    JSON.stringify({ ...session, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(value: string | undefined): Session | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    if (typeof data.userId !== "string" || typeof data.name !== "string") return null;
    return { userId: data.userId, name: data.name, role: data.role === "employee" ? "employee" : "executive" };
  } catch {
    return null;
  }
}

export async function readSession(): Promise<Session | null> {
  return decode((await cookies()).get(COOKIE)?.value);
}

export async function startSession(session: Session): Promise<void> {
  (await cookies()).set(COOKIE, encode(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/**
 * For route handlers: the session, or the response to return instead. Pass `roles` to allow
 * only those (e.g. `["executive"]`).
 */
export async function requireSession(
  roles?: Role[],
): Promise<{ session: Session; denied?: never } | { session?: never; denied: NextResponse }> {
  const session = await readSession();
  if (!session) {
    return { denied: NextResponse.json({ success: false, reason: "signed_out" }, { status: 401 }) };
  }
  if (roles && !roles.includes(session.role)) {
    return { denied: NextResponse.json({ success: false, reason: "forbidden" }, { status: 403 }) };
  }
  return { session };
}
