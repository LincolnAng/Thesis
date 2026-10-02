import { ArrowLeftRight, Box, Handshake, Home, Settings, ShoppingBag, Tag, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Plain-words name shown in Simple mode, when it differs. */
  simpleLabel?: string;
  icon: LucideIcon;
}

/**
 * The main sections, in sidebar order. Ask AI lives on Home; Events live under
 * Stakeholders.
 *
 * "People" read as staff — the shop's own helpers — when this section is the opposite:
 * everyone outside the business. Advanced says "Stakeholders" (buyers, suppliers and the
 * places you sell at), Simple says "Contacts".
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Transactions", simpleLabel: "Money", icon: ArrowLeftRight },
  { href: "/products", label: "Products", icon: ShoppingBag },
  { href: "/inventory", label: "Inventory", simpleLabel: "Stock", icon: Box },
  { href: "/people", label: "Stakeholders", simpleLabel: "Contacts", icon: Handshake },
  { href: "/pricing", label: "Pricing", simpleLabel: "Prices", icon: Tag },
];

/** Pinned to the bottom of the sidebar, below the main sections. */
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };
