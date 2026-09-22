import { ArrowLeftRight, Box, Home, Settings, ShoppingBag, Tag, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The main sections, in sidebar order. Ask AI lives on Home; Events live under People. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/products", label: "Products", icon: ShoppingBag },
  { href: "/inventory", label: "Inventory", icon: Box },
  { href: "/people", label: "People", icon: Users },
  { href: "/pricing", label: "Pricing", icon: Tag },
];

/** Pinned to the bottom of the sidebar, below the main sections. */
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };
