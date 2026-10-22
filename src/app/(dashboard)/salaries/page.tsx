"use client";

import { Page } from "@/components/layout/page";
import { SalariesScreen } from "@/components/salaries/salaries-screen";
import { TimeInPanel } from "@/components/salaries/time-in-panel";
import { MyDays } from "@/components/salaries/my-days";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";

/**
 * Salaries for Executives. For an employee the same tab is "Time in": today's time in and out,
 * and their own days this pay period — no rates, no pay (the server never sends them).
 */
export default function SalariesPage() {
  const me = useCurrentUser();
  if (isExecutive(me)) return <SalariesScreen />;
  return (
    <Page title="Time in">
      <div className="flex max-w-[760px] flex-col gap-8">
        <TimeInPanel />
        <MyDays />
      </div>
    </Page>
  );
}
