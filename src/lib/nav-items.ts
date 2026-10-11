import { ArrowLeftRight, Box, Home, Settings, ShoppingBag, Tag, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Plain-words name shown in Simple mode, when it differs. */
  simpleLabel?: string;
  icon: LucideIcon;
}

/**
 * The main sections, in sidebar order. Ask AI lives on Home; Events live under People.
 *
 * ONE name per section, in both modes. The sidebar used to rename itself when the view mode
 * changed — Inventory became Stock, Pricing became Prices, Transactions became Money — so the
 * same page had two names depending on a toggle elsewhere, and a note saying "check Inventory"
 * pointed at nothing she could see. Each section keeps the one name that says what it's for:
 * Products is what she sells, Inventory is what's on the shelf, and Prices works
 * out what to charge.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/products", label: "Products", icon: ShoppingBag },
  { href: "/inventory", label: "Inventory", icon: Box },
  { href: "/people", label: "People", icon: Users },
  { href: "/pricing", label: "Prices", icon: Tag },
];

/** Pinned to the bottom of the sidebar, below the main sections. */
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };
