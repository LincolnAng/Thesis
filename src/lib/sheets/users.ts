import { createSheetCollection } from "./collection";
import type { AppUser } from "@/lib/store/types";

/**
 * Who uses this app. One row per person, and the sheet is where they are created.
 *
 * The PIN is stored as the four digits, not a hash. A hash was the better instinct and the
 * wrong fit: profiles are now typed straight into the spreadsheet, and nobody can work out a
 * SHA-256 of "id:1234" in a cell. Plain digits are also honest about what this is — anyone
 * who can open the sheet can read every PIN, change any row, or add themselves. The PIN stops
 * two people on one tablet saving as each other; it is not a lock, and nothing on screen
 * claims otherwise.
 *
 * A hand-typed row has no id, so one is derived from the name. That means renaming someone in
 * the sheet creates a new profile rather than renaming the old one — the trade for being able
 * to add a person by typing two cells.
 */
const USER_HEADER = ["id", "name", "pinHash", "role", "createdAt", "deletedAt", "pin"];

/** Stable id for a row somebody typed without one. */
function idFromName(name: string): string {
  return `sheet:${name.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

function userToRow(u: AppUser): string[] {
  // The role column is kept and written blank: dropping it would shift every cell after
  // it on rows that already exist.
  return [u.id, u.name, u.pinHash, "", u.createdAt, "", u.pin ?? ""];
}

function userFromRow(row: string[]): AppUser | null {
  const [id, name, pinHash, , createdAt, , pin] = row;
  const trimmedName = (name ?? "").trim();
  // A row needs a name, not an id — the id is what the app wants and the name is what a
  // person types. Rows with neither are blank spreadsheet lines and are skipped.
  if (!trimmedName) return null;
  return {
    id: id || idFromName(trimmedName),
    name: trimmedName,
    pinHash: pinHash ?? "",
    pin: (pin ?? "").trim(),
    createdAt: createdAt || new Date().toISOString(),
  };
}

export const usersCollection = createSheetCollection<AppUser>({
  sheetName: "Users",
  header: USER_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: userToRow,
  fromRow: userFromRow,
});
