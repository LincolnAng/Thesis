import { Bot, Box, Calculator, Home, Package, Receipt, Settings, Truck, Users, Wallet, type LucideIcon } from "lucide-react";

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
  { href: "/allocations", label: "Allocations", icon: Package },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/pricing", label: "Pricing", icon: Calculator },
  { href: "/chat", label: "Ask AI", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];
