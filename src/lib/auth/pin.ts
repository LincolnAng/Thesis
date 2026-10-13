import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { UserRecord } from "@/lib/sheets/users";

/**
 * PIN hashing and checking — server only.
 *
 * Four digits are 10,000 guesses, so no hash makes a PIN a password; what hashing buys is that
 * the Users sheet no longer shows everyone's PIN to anyone who opens it. scrypt with a per-row
 * salt means two people with the same PIN don't share a hash either.
 */

const PREFIX = "scrypt";

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `${PREFIX}$${salt}$${hash}`;
}

/** The hash this app wrote before PINs moved to the server: SHA-256 over "id:digits". Still
 *  written during the transition so the live site's old sign-in can check it. */
export function legacyHash(userId: string, pin: string): string {
  return createHash("sha256").update(`${userId}:${pin}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The PIN columns to write for a new or changed PIN: always the scrypt hash, plus the legacy
 * forms while LEGACY_PIN_COLUMNS is on (see sheets/users.ts).
 */
export function pinColumns(userId: string, pin: string, legacy: boolean): Pick<UserRecord, "pinSecure" | "pinHash" | "pin"> {
  return { pinSecure: hashPin(pin), pinHash: legacy ? legacyHash(userId, pin) : "", pin: "" };
}

/**
 * Checks a PIN against whatever form the row holds, trusting the scrypt hash when there is one.
 * `upgrade` is set when the row has no scrypt hash yet and should get one.
 */
export function verifyPin(user: UserRecord, pin: string): { ok: boolean; upgrade: boolean } {
  if (!user.hasPin) return { ok: true, upgrade: false };
  if (user.pinSecure.startsWith(`${PREFIX}$`)) {
    const [, salt, expected] = user.pinSecure.split("$");
    const actual = scryptSync(pin, salt, 32).toString("hex");
    return { ok: safeEqual(actual, expected), upgrade: false };
  }
  if (user.pin) return { ok: safeEqual(pin, user.pin), upgrade: true };
  return { ok: safeEqual(legacyHash(user.id, pin), user.pinHash), upgrade: true };
}
