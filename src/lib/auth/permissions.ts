"use client";

import { useCurrentUser } from "@/lib/auth/current-user";
import { useStore } from "@/lib/store/use-store";
import { roleCan, type Permission } from "@/lib/auth/access-rules";

/** React bindings for the rules in access-rules.ts, which is kept pure so it can be tested. */

function useAnOwnerExists(): boolean {
  const { users } = useStore();
  return users.some((u) => u.role === "owner");
}

export function useCan(permission: Permission): boolean {
  const user = useCurrentUser();
  return roleCan(user?.role ?? null, permission, useAnOwnerExists());
}

/** For the few places that need the whole picture at once rather than one question. */
export function useIsHelper(): boolean {
  const user = useCurrentUser();
  const anOwner = useAnOwnerExists();
  return user?.role === "helper" && anOwner;
}

export type { Permission };
