import { Bot, LayoutGrid, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Bot },
  { href: "/summary", label: "Summary", icon: LayoutGrid },
  { href: "/settings", label: "Settings", icon: Settings },
];
