import { createSheetCollection } from "./collection";
import type { AppUser } from "@/lib/store/types";

/**
 * Who uses this app. One row per person on the shared device.
 *
 * The PIN is stored as a hash, not as the four digits — not because a hash in a spreadsheet
 * is real security (anyone who can open the sheet can replace the row), but so that glancing
 * at the sheet doesn't hand over everyone's PIN. This is a "who did that?" feature, and it's
 * described that way wherever it appears on screen.
 */
const USER_HEADER = ["id", "name", "pinHash", "role", "createdAt", "deletedAt"];

function userToRow(u: AppUser): string[] {
  return [u.id, u.name, u.pinHash, u.role, u.createdAt, ""];
}

function userFromRow(row: string[]): AppUser | null {
  const [id, name, pinHash, role, createdAt] = row;
  if (!id) return null;
  return {
    id,
    name: name ?? "",
    pinHash: pinHash ?? "",
    role: role === "owner" ? "owner" : "helper",
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
