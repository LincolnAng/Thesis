import { Bot, Box, Home, Receipt, Settings, Truck, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/sales", label: "Sales", icon: Receipt },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/stock", label: "Stock", icon: Box },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/chat", label: "Ask AI", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];
