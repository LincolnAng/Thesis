import { Bot, Home, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/chat", label: "Ask AI", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];
