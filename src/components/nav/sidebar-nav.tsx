"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/lib/summary/view-mode";
import { NAV_ITEMS, SETTINGS_ITEM, type NavItem } from "@/lib/nav-items";
import { useCurrentUser, signOut } from "@/lib/auth/current-user";
import { useIsHelper } from "@/lib/auth/permissions";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const [mode] = useViewMode();
  const label = mode === "simple" ? (item.simpleLabel ?? item.label) : item.label;
  return (
    <Link
      href={item.href}
      title={label}
      className={cn(
        "flex items-center gap-3 rounded-[10px] text-sm transition-colors",
        "justify-center px-2 py-2.5 min-[1024px]:justify-start min-[1024px]:px-3",
        active ? "bg-cacao/10 font-semibold text-cacao" : "font-medium text-muted-foreground hover:bg-secondary",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
      <span className="hidden truncate-line min-[1024px]:inline">{label}</span>
    </Link>
  );
}

/**
 * Full sidebar above 1024px, an icon rail between 768 and 1024, and nothing below that —
 * the bottom tab bar takes over on phones.
 */
export function SidebarNav() {
  const pathname = usePathname();
  const helper = useIsHelper();
  const me = useCurrentUser();

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-line/10 bg-card py-6",
        "min-[768px]:flex min-[768px]:w-[var(--rail-w)] min-[768px]:items-center min-[768px]:px-2",
        "min-[1024px]:w-[var(--sidebar-w)] min-[1024px]:items-stretch min-[1024px]:px-4",
      )}
    >
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-cacao font-display text-[15px] font-bold text-ivory">
          M
        </div>
        <div className="hidden min-[1024px]:block">
          <div className="font-display text-[15px] font-semibold leading-tight">Mang Kiko&apos;s</div>
          <div className="text-[11px] leading-tight text-muted-foreground">Cocoa · Dashboard</div>
        </div>
      </div>

      <nav className="flex w-full flex-col gap-1">
        {NAV_ITEMS.filter((item) => !(item.ownerOnly && helper)).map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </nav>

      <div className="mt-auto w-full space-y-1">
        {!(SETTINGS_ITEM.ownerOnly && helper) && (
          <NavLink item={SETTINGS_ITEM} active={isActive(pathname, SETTINGS_ITEM.href)} />
        )}
        {/* Whoever is holding the tablet, and one tap to hand it over. Switching used to be
            buried in Settings, which a helper cannot even open. */}
        {me && (
          <button
            type="button"
            onClick={signOut}
            title={`Signed in as ${me.name} — tap to switch`}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition hover:bg-secondary"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cacao text-[11px] font-bold text-ivory">
              {me.name.trim().slice(0, 2).toUpperCase()}
            </span>
            <span className="hidden min-w-0 min-[1024px]:block">
              <span className="block truncate text-[13px] font-semibold leading-tight">{me.name}</span>
              <span className="block text-[11px] leading-tight text-muted-foreground">
                {me.role === "owner" ? "Owner · switch" : "Helper · switch"}
              </span>
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
