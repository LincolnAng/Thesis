"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { navItemsFor, SECONDARY_ITEMS } from "@/lib/nav-items";
import { signOut, useCurrentUser } from "@/lib/auth/current-user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TAB = "flex min-w-16 flex-1 shrink-0 flex-col items-center gap-1 px-1 py-3 text-xs font-medium";

/**
 * Phones and tablets: the five tabs, then "Me" — the profile menu that holds Settings and
 * switching who's holding the device.
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const me = useCurrentUser();
  const secondary = SECONDARY_ITEMS;
  const inSecondary = secondary.some((item) => pathname.startsWith(item.href));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-line/10 bg-card min-[900px]:hidden">
      {navItemsFor(me?.role).map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className={cn(TAB, active ? "font-semibold text-cacao" : "text-muted-foreground")}>
            <Icon className="h-6 w-6" />
            {item.label}
          </Link>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(TAB, inSecondary ? "font-semibold text-cacao" : "text-muted-foreground")}>
          <UserRound className="h-6 w-6" />
          Me
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="min-w-52">
          {me && (
            <DropdownMenuLabel>
              {me.name}
              <span className="block text-xs font-normal text-muted-foreground">
                {ROLE_LABELS[me.role]}
              </span>
            </DropdownMenuLabel>
          )}
          <DropdownMenuSeparator />
          {secondary.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenuItem key={item.href} asChild className="min-h-11">
                <Link href={item.href}>
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
