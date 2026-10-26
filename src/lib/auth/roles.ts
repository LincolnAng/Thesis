import type { Role } from "@/lib/store/types";

/**
 * The three roles, set by an Executive (Sandy):
 *
 *   executive  sees and changes everything; the only role that assigns roles or deletes profiles
 *   admin      the profile signed in on the main computer (Ruchel): the employee view, plus the
 *              ONLY place anyone is timed in and out, plus adding new profiles (as Employees)
 *   employee   logs sales, expenses, spoilage and stock; no costs, pay or debts
 *
 * Time in and out lives on the Admin profile alone so there's one place it happens, on one
 * computer — no one times themselves in from a phone.
 */
export const ROLES: Role[] = ["executive", "admin", "employee"];

export const ROLE_LABELS: Record<Role, string> = { executive: "Executive", admin: "Admin", employee: "Employee" };

export const ROLE_HINTS: Record<Role, string> = {
  executive: "Executive — sees everything, including costs, R&D and payroll; sets everyone's role",
  admin: "Admin — the main computer: times everyone in and out, and can add people",
  employee: "Employee — logs sales, expenses, spoilage and batches; no costs, pay or debts",
};

/** A role as stored. Blank reads as executive: every profile made before roles existed was the owner's. */
export function parseRole(raw: unknown): Role {
  const r = String(raw ?? "").trim().toLowerCase();
  return r === "employee" ? "employee" : r === "admin" ? "admin" : "executive";
}

/** Who may add new profiles: Executives and the Admin. */
export const canAddProfiles = (role: Role | undefined | null) => role === "executive" || role === "admin";
