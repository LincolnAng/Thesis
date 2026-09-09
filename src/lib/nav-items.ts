import {
  Bot,
  Box,
  Calculator,
  CalendarDays,
  Home,
  Package,
  Receipt,
  Settings,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// 11 items now that Customers/Allocations/Events have joined Home/Sales/Expenses/Stock/
// Suppliers/Pricing/Ask AI/Settings — both nav surfaces (bottom-tab-bar.tsx's overflow-x-auto,
// sidebar-nav.tsx's plain vertical list) render this fine with no layout break, but it's
// getting long enough to scan that a grouped/collapsed nav is worth a dedicated pass once
// real usage shows which of these the owner actually reaches for day to day.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/sales", label: "Sales", icon: Receipt },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/stock", label: "Stock", icon: Box },
  { href: "/allocations", label: "Allocations", icon: Package },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/pricing", label: "Pricing", icon: Calculator },
  { href: "/chat", label: "Ask AI", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];
