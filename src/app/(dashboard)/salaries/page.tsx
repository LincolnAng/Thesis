"use client";

import { Page } from "@/components/layout/page";
import { SalariesScreen } from "@/components/salaries/salaries-screen";
import { TimeInPanel } from "@/components/salaries/time-in-panel";
import { MyDays } from "@/components/salaries/my-days";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { useStore } from "@/lib/store/use-store";
import { isTimekeeper, timekeeperIds } from "@/lib/payroll/timekeepers";

/**
 * Salaries for Executives. For a timekeeper (Ruchel, Aunty Sandy — named under Salaries →
 * Staff) the same tab is "Time in": everyone's time in and out today, including staff with no
 * profile of their own, and each person's days this pay period — no rates, no pay (the server
 * never sends them). Anyone else is told who keeps time.
 */
export default function SalariesPage() {
  const me = useCurrentUser();
  const { businessSettings, users } = useStore();
  if (isExecutive(me)) return <SalariesScreen />;
  if (!isTimekeeper(businessSettings, me?.id)) {
    const keepers = timekeeperIds(businessSettings)
      .map((id) => users.find((u) => u.id === id)?.name)
      .filter(Boolean);
    return (
      <Page title="Time in">
        <p className="max-w-[640px] rounded-2xl border border-line/15 bg-card px-5 py-8 text-center text-[15px] text-muted-foreground">
          {keepers.length ? `Time in and out is recorded by ${keepers.join(" and ")}.` : "Time in and out is recorded by the timekeepers an Executive names."}
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
