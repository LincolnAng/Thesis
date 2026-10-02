"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/lib/summary/view-mode";
import { NAV_ITEMS, SETTINGS_ITEM } from "@/lib/nav-items";

export function BottomTabBar() {
  const pathname = usePathname();
  const [mode] = useViewMode();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-line/10 bg-white min-[900px]:hidden">
      {[...NAV_ITEMS, SETTINGS_ITEM].map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              // 11px rather than 14: the longest labels ("Transactions", "Stakeholders")
              // have to fit one line in an 80px tab without being cut off.
              "flex w-20 shrink-0 flex-col items-center gap-1 px-1 py-3 text-[11px] font-medium",
              active ? "text-cacao font-semibold" : "text-muted-foreground",
            )}
          >
            <Icon className="h-6 w-6" />
            <span className="max-w-full truncate">{mode === "simple" ? (item.simpleLabel ?? item.label) : item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
