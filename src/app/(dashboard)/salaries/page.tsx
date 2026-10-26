"use client";

import { Page } from "@/components/layout/page";
import { SalariesScreen } from "@/components/salaries/salaries-screen";
import { TimeInPanel } from "@/components/salaries/time-in-panel";
import { MyDays } from "@/components/salaries/my-days";
import { isAdmin, isExecutive, useCurrentUser } from "@/lib/auth/current-user";

/**
 * Salaries for Executives. For the Admin — the profile on the main computer (Ruchel) — the same
 * tab is "Time in": everyone's time in and out today, including staff with no profile of their
 * own, and each person's days this pay period; no rates, no pay (the server never sends them).
 * It's the only place anyone is timed in or out. Anyone else is told where to go.
 */
export default function SalariesPage() {
  const me = useCurrentUser();
  if (isExecutive(me)) return <SalariesScreen />;
  if (!isAdmin(me)) {
    return (
      <Page title="Time in">
        <p className="max-w-[640px] rounded-2xl border border-line/15 bg-card px-5 py-8 text-center text-[15px] text-muted-foreground">
          Time in and out is done on the main computer, on the Admin profile.
        </p>
      </Page>
    );
  }
  return (
    <Page title="Time in">
      <div className="flex max-w-[760px] flex-col gap-8">
        <TimeInPanel />
        <MyDays keeper />
      </div>
    </Page>
  );
}
