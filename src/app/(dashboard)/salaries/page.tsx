"use client";

import { Page } from "@/components/layout/page";
import { SalariesScreen } from "@/components/salaries/salaries-screen";
import { isAdmin, isExecutive, useCurrentUser } from "@/lib/auth/current-user";

/**
 * Salaries, for Executives and the Admin — the profile on the main computer (Ruchel), who times
 * everyone in and out (including staff with no profile of their own) and works out their pay.
 * Employees are told where time in happens; they never see pay.
 */
export default function SalariesPage() {
  const me = useCurrentUser();
  if (isExecutive(me) || isAdmin(me)) return <SalariesScreen />;
  return (
    <Page title="Time in">
      <p className="max-w-[640px] rounded-2xl border border-line/15 bg-card px-5 py-8 text-center text-[15px] text-muted-foreground">
        Time in and out is done on the main computer, on the Admin profile.
      </p>
    </Page>
  );
}
