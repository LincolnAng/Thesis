"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav-items";

/** Desktop-only persistent nav — same colors/type/active-state treatment as before,
 * just arranged as a vertical sidebar instead of a horizontal top bar. Mobile keeps
 * the existing bottom tab bar untouched. */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col border-r border-border bg-card px-3 py-4 min-[900px]:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="text-xl">🍫</span>
        <span className="text-sm font-bold text-foreground">Mang Kiko&apos;s Cocoa</span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
