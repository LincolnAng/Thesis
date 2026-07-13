"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav-items";

export function TopHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 hidden h-16 items-center justify-between border-b border-border bg-card px-6 min-[900px]:flex">
      <div className="flex items-center gap-2">
        <span className="text-xl">🍫</span>
        <span className="text-sm font-bold text-foreground">Mang Kiko&apos;s Cocoa</span>
      </div>
      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
