"use client";

import { Lock } from "lucide-react";
import { signOut, useCurrentUser } from "@/lib/auth/current-user";
import { useIsHelper } from "@/lib/auth/permissions";

/**
 * Stands in for a page a helper should not be on.
 *
 * Hiding the link in the sidebar is tidiness, not a door — the URL still works, and a shared
 * tablet with a back button finds it eventually. This is the door. It is still only a door on
 * a cupboard: the Google Sheet behind all of this is readable by anyone who has the link, and
 * nothing in the browser can change that.
 */
export function OwnerOnly({ what, children }: { what: string; children: React.ReactNode }) {
  const helper = useIsHelper();
  const me = useCurrentUser();
  if (!helper) return <>{children}</>;

  return (
    <div className="mx-auto flex max-w-[460px] flex-col items-center gap-4 rounded-2xl border border-line/15 bg-card px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </span>
      <div>
        <h2 className="font-display text-[20px] font-semibold">{what} is for the owner</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
          {`You're signed in as ${me?.name ?? "a helper"}. You can log sales, purchases, batches and spoilage — the
          money side is kept to the owner.`}
        </p>
      </div>
      <button
        type="button"
        onClick={signOut}
        className="rounded-[10px] bg-cacao px-4 py-2.5 text-[14px] font-semibold text-ivory"
      >
        Switch to someone else
      </button>
    </div>
  );
}
