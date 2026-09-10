"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav-items";

/**
 * Three widths, because three situations.
 *
 * Below 768px there isn't room for persistent nav at all and the bottom tab bar takes over.
 * Between 768 and 1024 a 240px sidebar eats too much of the content area, so it collapses to
 * a 72px icon rail — labels go, the destinations stay. Above 1024 it's the full sidebar.
 */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-border bg-card py-4",
        "min-[768px]:flex min-[768px]:w-[var(--rail-w)] min-[768px]:items-center min-[768px]:px-2",
        "min-[1024px]:w-[var(--sidebar-w)] min-[1024px]:items-stretch min-[1024px]:px-3",
      )}
    >
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="text-xl">🍫</span>
        <span className="hidden text-sm font-bold text-foreground min-[1024px]:inline">Mang Kiko&apos;s Cocoa</span>
      </div>
      <nav className="flex w-full flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex items-center gap-2 rounded-[var(--radius-control)] text-sm font-medium transition-colors",
                "justify-center px-2 py-2.5 min-[1024px]:justify-start min-[1024px]:px-3",
                active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden truncate-line min-[1024px]:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
