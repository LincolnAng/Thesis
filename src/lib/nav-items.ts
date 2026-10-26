import { ArrowLeftRight, Boxes, CalendarDays, Clock, Factory, Home, Settings, Tag, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/store/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * The main tabs. Ask AI lives on Home.
 *
 * Inventory is everyone's: what's on the shelf, at each branch. Production is what was made
 * (roasts, batches, leftover cacao); Forecast is what to make and buy next. Costing (what things cost and
 * what they sell for) and Salaries are Executives'. Time in is the Admin's alone (the profile
 * on the main computer), so there is one place anyone is timed in or out.
 *
 * ONE name per section: a page that renames itself depending on a toggle elsewhere leaves a
 * note like "check Inventory" pointing at nothing.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/costing", label: "Costing", icon: Tag },
  { href: "/production", label: "Production", icon: Factory },
  { href: "/forecast", label: "Forecast", icon: TrendingUp },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/salaries", label: "Salaries", icon: Wallet },
];

const TIME_IN: NavItem = { href: "/salaries", label: "Time in", icon: Clock };

/** The tabs as a profile sees them. */
export function navItemsFor(role: Role | undefined): NavItem[] {
  if (role === "executive") return NAV_ITEMS;
  return NAV_ITEMS.flatMap((item) => {
    if (item.href === "/costing") return [];
    // Time in and out happens on the Admin profile only — the main computer.
    if (item.href === "/salaries") return role === "admin" ? [TIME_IN] : [];
    return [item];
  });
}

/** Not a tab: reached from the profile menu (bottom of the sidebar, last tab on phones). */
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };

/** Everyone gets Settings — an employee's holds their own name and display options. */
export const SECONDARY_ITEMS: NavItem[] = [SETTINGS_ITEM];
