"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/use-store";
import { useCurrentUser } from "@/lib/auth/current-user";
import { useCalendarEntries } from "@/lib/calendar/use-calendar-entries";
import { buildReminders, type Reminders } from "@/lib/reminders/reminders";
import { salaryReminders } from "@/lib/payroll/reminders";
import { manilaToday } from "@/lib/payroll/pay";

/** Today's reminders for whoever is signed in — an employee's data has no payments or pay in it. */
export function useReminders(): Reminders {
  const { entries, staff, timeRecords, payroll } = useStore();
  const me = useCurrentUser();
  const { all, today } = useCalendarEntries();
  return useMemo(() => {
    const salaries = salaryReminders({ role: me?.role ?? "employee", userId: me?.id ?? null, staff, timeRecords, payroll, today: manilaToday() });
    return buildReminders(all, entries, today, salaries);
  }, [all, entries, today, staff, timeRecords, payroll, me?.role, me?.id]);
}
