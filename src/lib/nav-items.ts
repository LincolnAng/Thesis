import { ArrowLeftRight, CalendarDays, Factory, Home, Settings, Tag, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * The five main tabs, the same for every profile. What each one shows depends on the role
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
];

/**
 * Not tabs: reached from the profile menu (bottom of the sidebar, last tab on phones). People
 * holds customers, suppliers and events; Settings is the owner's — AI key, spreadsheet, reset.
 */
export const PEOPLE_ITEM: NavItem = { href: "/people", label: "People", icon: Users };
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };

/** Everyone gets Settings — an employee's holds only their own profile (to change their PIN). */
export const SECONDARY_ITEMS: NavItem[] = [PEOPLE_ITEM, SETTINGS_ITEM];
