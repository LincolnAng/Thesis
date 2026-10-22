"use client";

import { useStore } from "@/lib/store/use-store";
import { useCurrentUser } from "@/lib/auth/current-user";
import { daysIn, formatClock, hoursWorked, manilaToday, parseDay, periodFor } from "@/lib/payroll/pay";
import { STATUS_INFO } from "@/components/salaries/time-record";

/** An employee's own days this pay period, when their profile is linked to a staff member. */
export function MyDays() {
  const { staff, timeRecords } = useStore();
  const me = useCurrentUser();
  const mine = staff.find((s) => s.userId && s.userId === me?.id);
  if (!mine) return null;
  const today = manilaToday();
  const period = periodFor(today);
  const days = daysIn(period).filter((d) => d <= today).reverse();

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-[20px] font-semibold">Your days, {period.label}</h2>
      <ul className="flex flex-col divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/15 bg-card">
        {days.map((d) => {
          const r = timeRecords.find((x) => x.staffId === mine.id && x.date === d);
          const h = r ? hoursWorked(r) : null;
          return (
            <li key={d} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px]">
              <span className="font-medium">{parseDay(d).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="text-muted-foreground">
                {r ? (r.timeIn ? `${formatClock(r.timeIn)} – ${r.timeOut ? formatClock(r.timeOut) : "…"}${h != null ? ` · ${h} h` : ""}` : STATUS_INFO[r.status].label) : "Nothing recorded"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[12.5px] text-muted-foreground">Something wrong on an earlier day? Ask an Executive to fix it.</p>
    </section>
  );
}
