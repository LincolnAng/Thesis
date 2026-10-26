import { parseRole as parseRoleShared } from "@/lib/auth/roles";
import { createSheetCollection } from "./collection";
import type { AppUser, Role } from "@/lib/store/types";

/**
 * Who uses this app. One row per person. Server-only: the PIN columns never reach a browser —
 * the API hands out `AppUser` (see `toPublicProfile`), which only says whether a PIN is set.
 *
 * PINs are stored hashed with scrypt (see lib/auth/pin.ts) in `pinSecure`. A row can still be
 * typed straight into the sheet with the four digits in the `pin` column; the first successful
 * sign-in writes the scrypt hash.
 *
 * TRANSITION — while the live site (main) still runs the old sign-in, which reads `pin` and the
 * old SHA-256 `pinHash`, this code keeps those two columns working: it never clears them, and
 * a PIN set here also writes the old SHA-256 hash, so a profile made on the redesign preview
 * can still sign in on the live site. Both legacy columns are as readable as the digits
 * themselves (four digits are 10,000 guesses). Once the redesign is live, run the cleanup
 * that blanks `pin` and `pinHash` and drop the legacy writes (see `LEGACY_PIN_COLUMNS`).
 *
 * `role` is "executive", "admin" or "employee". A blank role reads as executive: every profile made
 * before roles came back had full access, and taking it away silently would lock the owners
 * out of their own costing. New profiles always get an explicit role.
 *
 * A hand-typed row has no id, so one is derived from the name. That means renaming someone in
 * the sheet creates a new profile rather than renaming the old one — the trade for being able
 * to add a person by typing two cells.
 */
const USER_HEADER = ["id", "name", "pinHash", "role", "createdAt", "deletedAt", "pin", "color", "pinSecure"];

/** Keep writing the old-format PIN columns the live site's sign-in reads. See TRANSITION above. */
export const LEGACY_PIN_COLUMNS = true;

export interface UserRecord extends AppUser {
  /** scrypt hash — the one this code trusts. */
  pinSecure: string;
  /** Legacy SHA-256 over "id:digits", which the live site's old sign-in checks. */
  pinHash: string;
  /** Plain digits typed into the sheet. */
  pin: string;
}

/** Stable id for a row somebody typed without one. */
function idFromName(name: string): string {
  return `sheet:${name.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

export function parseRole(raw: string | undefined): Role {
  return parseRoleShared(raw);
}

function userToRow(u: UserRecord): string[] {
  return [u.id, u.name, u.pinHash, u.role, u.createdAt, "", u.pin, u.color, u.pinSecure];
}

function userFromRow(row: string[]): UserRecord | null {
  const [id, name, pinHash, role, createdAt, , pin, color, pinSecure] = row;
  const trimmedName = (name ?? "").trim();
  // A row needs a name, not an id — the id is what the app wants and the name is what a
  // person types. Rows with neither are blank spreadsheet lines and are skipped.
  if (!trimmedName) return null;
  const hash = (pinHash ?? "").trim();
  const digits = (pin ?? "").trim();
  const secure = (pinSecure ?? "").trim();
  return {
    id: id || idFromName(trimmedName),
    name: trimmedName,
    role: parseRole(role),
    color: (color ?? "").trim(),
    hasPin: Boolean(secure || hash || digits),
    pinSecure: secure,
    pinHash: hash,
    pin: digits,
    createdAt: createdAt || new Date().toISOString(),
  };
}

export function toPublicProfile(u: UserRecord): AppUser {
  return { id: u.id, name: u.name, role: u.role, color: u.color, hasPin: u.hasPin, createdAt: u.createdAt };
}

export const usersCollection = createSheetCollection<UserRecord>({
  sheetName: "People & Payroll",
  section: "User",
  header: USER_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: userToRow,
  fromRow: userFromRow,
});
