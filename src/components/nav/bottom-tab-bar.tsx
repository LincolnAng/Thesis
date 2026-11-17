"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { navItemsFor, SECONDARY_ITEMS, type NavItem } from "@/lib/nav-items";
import { signOut, useCurrentUser } from "@/lib/auth/current-user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Pressed in on touch, not on release, so the tap is felt the moment it lands.
const TAB = "flex min-w-0 flex-1 flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[11.5px] font-medium transition-transform duration-100 active:scale-95";

/** The tabs that stay on the bar; everything else is one tap away under More. */
const ON_BAR = ["/", "/transactions", "/inventory", "/calendar"];

const isActive = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/**
 * Phones and tablets: four tabs and More.
 *
 * It used to carry every page in a strip that scrolled sideways — nine at once, the last few
 * off the edge where nobody knew to look, and long labels running into each other. A tab bar
 * reads at a glance only when everything on it fits, so the four used most stay and the rest,
 * with Settings and switching who's holding the device, sit under More.
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const me = useCurrentUser();
  const all = navItemsFor(me?.role);
  const onBar = all.filter((item) => ON_BAR.includes(item.href));
  const more: NavItem[] = [...all.filter((item) => !ON_BAR.includes(item.href)), ...SECONDARY_ITEMS];
  const inMore = more.some((item) => isActive(item.href, pathname));

  return (
    <nav
      className="tab-bar fixed inset-x-0 bottom-0 z-40 flex border-t border-line/10 bg-card/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 min-[900px]:hidden"
      aria-label="Pages"
    >
      {onBar.map((item) => {
        const active = isActive(item.href, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(TAB, active ? "font-semibold text-cacao" : "text-muted-foreground")}
          >
            <Icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(TAB, inMore ? "font-semibold text-cacao" : "text-muted-foreground")}>
          <Ellipsis className="h-6 w-6" strokeWidth={inMore ? 2.25 : 1.75} />
          More
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" sideOffset={8} className="min-w-56">
          {me && (
            <>
              <DropdownMenuLabel>
                {me.name}
                <span className="block text-xs font-normal text-muted-foreground">{ROLE_LABELS[me.role]}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          {more.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, pathname);
            return (
              <DropdownMenuItem key={item.href} asChild className={cn("min-h-11", active && "font-semibold text-cacao")}>
                <Link href={item.href} aria-current={active ? "page" : undefined}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-11" onSelect={() => void signOut()}>
            <LogOut className="h-4 w-4" />
            Switch profile
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
