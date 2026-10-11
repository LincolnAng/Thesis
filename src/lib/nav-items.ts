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
 * pointed at nothing she could see. The plain words won, because the person using this every
 * day has no business background and the other names were jargon she had to translate.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/products", label: "Inventory", icon: ShoppingBag },
  { href: "/inventory", label: "Stock", icon: Box },
  { href: "/people", label: "People", icon: Users },
  { href: "/pricing", label: "Prices", icon: Tag },
];

/** Pinned to the bottom of the sidebar, below the main sections. */
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };
