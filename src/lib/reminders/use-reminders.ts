"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/use-store";
import { useCalendarEntries } from "@/lib/calendar/use-calendar-entries";
import { buildReminders, type Reminders } from "@/lib/reminders/reminders";

/** Today's reminders for whoever is signed in — an employee's data has no payments in it. */
export function useReminders(): Reminders {
  const { entries } = useStore();
  const { all, today } = useCalendarEntries();
  return useMemo(() => buildReminders(all, entries, today), [all, entries, today]);
}
