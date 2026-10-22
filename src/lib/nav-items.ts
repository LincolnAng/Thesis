import { ArrowLeftRight, Boxes, CalendarDays, Clock, Factory, Home, Settings, Tag, Wallet, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/store/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * The main tabs, the same for every profile. What each one shows depends on the role
 * (an employee's Costing is a product gallery), but nobody gets a different set of tabs:
 * "check Costing" should point at something everyone can see. Ask AI lives on Home.
 *
 * ONE name per section, in both modes: a page that renames itself depending on a toggle
 * elsewhere leaves a note like "check Inventory" pointing at nothing.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/costing", label: "Costing", icon: Tag },
  { href: "/production", label: "Production", icon: Factory },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/salaries", label: "Salaries", icon: Wallet },
];

/**
 * The tabs as a profile sees them. An employee's Costing tab is the shop's inventory — what's
 * on the shelf, product by product — with no costs, so it is called Inventory for them. Same
 * address (/costing), same place in the bar. Likewise Salaries: for an employee it's where they
 * time in and out, with no pay on it, so it's called Time in.
 */
const EMPLOYEE_NAMES: Record<string, Pick<NavItem, "label" | "icon">> = {
  "/costing": { label: "Inventory", icon: Boxes },
  "/salaries": { label: "Time in", icon: Clock },
};

export function navItemsFor(role: Role | undefined): NavItem[] {
  if (role === "executive") return NAV_ITEMS;
  return NAV_ITEMS.map((item) => (EMPLOYEE_NAMES[item.href] ? { ...item, ...EMPLOYEE_NAMES[item.href] } : item));
}

/** Not a tab: reached from the profile menu (bottom of the sidebar, last tab on phones). */
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };

/** Everyone gets Settings — an employee's holds their own name and display options. */
export const SECONDARY_ITEMS: NavItem[] = [SETTINGS_ITEM];
