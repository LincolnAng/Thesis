
/**
 * What a helper is allowed to do.
 *
 * ONE THING THIS IS NOT: security. The data lives in a Google Sheet, and anyone who can open
 * that Sheet can read and change every figure in it regardless of what this file says. These
 * rules keep a helper from wandering into the owner's screens on the shared tablet — a lock
 * on the cupboard, not on the house. Writing them as if they were a security boundary would
 * be the dangerous version, because somebody would then trust them with something.
 *
 * The split follows what a helper is actually for: they log the day's work. What the business
 * earns, what it charges, and who may use it are the owner's.
 */

export type Permission =
  /** See money totals, profit, margins — anything about how the business is doing. */
  | "see_money"
  /** Change what things sell for. */
  | "set_prices"
  /** Remove a transaction rather than correcting it. */
  | "delete_records"
  /** Settings, people, the AI key, resetting data. */
  | "manage_settings"
  /** Open the underlying spreadsheet, which is everything at once. */
  | "open_sheet";

const HELPER_CAN: Permission[] = [];

export function roleCan(
  role: "owner" | "helper" | null,
  permission: Permission,
  /** False when not a single person is marked as the owner. */
  anOwnerExists = true,
): boolean {
  // Nobody signed in means nobody has been set up yet — a one-person shop that never added
  // people should not be locked out of its own app.
  if (role === null) return true;
  if (role === "owner") return true;
  // Every person is a helper. That is not a shop where nobody is in charge, it is a shop
  // where nobody filled the field in — and locking all of them out of Money and Settings
  // would leave no one able to fix it. Restrictions start once an owner exists to grant them.
  if (!anOwnerExists) return true;
  return HELPER_CAN.includes(permission);
}
