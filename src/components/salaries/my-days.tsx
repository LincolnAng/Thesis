"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { useCurrentUser } from "@/lib/auth/current-user";
import { daysIn, formatClock, hoursWorked, manilaToday, parseDay, periodFor } from "@/lib/payroll/pay";
import { STATUS_INFO } from "@/components/salaries/time-record";
import { FixTimesDialog } from "@/components/salaries/time-in-panel";
import type { TimeRecord } from "@/lib/store/types";

/**
 * An employee's own days this pay period, newest first. Forgot to time in, or tapped late?
 * They put in or fix their own times here — this period only (the server holds them to that).
 * Whether a day counts and overtime stay with Executives.
 */
export function MyDays({ keeper = false }: { keeper?: boolean }) {
  const { staff, timeRecords } = useStore();
  const me = useCurrentUser();
  const [fixing, setFixing] = useState<{ date: string; record: TimeRecord | null } | null>(null);
  // A timekeeper looks after everyone's days; anyone else, their own.
  const people = keeper ? [...staff].filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name)) : staff.filter((s) => s.userId && s.userId === me?.id);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const mine = people.find((s) => s.id === pickedId) ?? people[0];
  if (!mine) return null;
  const today = manilaToday();
  const period = periodFor(today);
  const days = daysIn({ start: period.start, end: today }).reverse();

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-[20px] font-semibold">{keeper ? `Days this pay period, ${period.label}` : `Your days, ${period.label}`}</h2>
      {keeper && people.length > 1 && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Whose days">
          {people.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={s.id === mine.id}
              onClick={() => setPickedId(s.id)}
              className={`min-h-10 rounded-full border px-4 text-[14px] font-semibold ${s.id === mine.id ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card"}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <p className="text-[13px] text-muted-foreground">Forgot to time in or out? Tap the pencil on that day to put the times in.</p>
      <ul className="flex flex-col divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/15 bg-card">
        {days.map((d) => {
          const r = timeRecords.find((x) => x.staffId === mine.id && x.date === d) ?? null;
          const h = r ? hoursWorked(r) : null;
          const notWorking = r && (r.status === "absent" || r.status === "off" || r.status === "leave");
          return (
            <li key={d} className="flex items-center justify-between gap-3 px-4 py-2 text-[14px]">
              <span className="font-medium">{parseDay(d).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="ml-auto text-right text-muted-foreground">
                {r
                  ? notWorking
                    ? STATUS_INFO[r.status].label
                    : r.timeIn
                      ? `${formatClock(r.timeIn)} – ${r.timeOut ? formatClock(r.timeOut) : "no time out"}${h != null ? ` · ${h} h` : ""}`
                      : STATUS_INFO[r.status].label
                  : "Nothing recorded"}
              </span>
              {!notWorking && (
                <button
                  type="button"
                  onClick={() => setFixing({ date: d, record: r })}
                  aria-label={r?.timeIn ? "Fix times" : "Put in times"}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line/20 text-muted-foreground hover:bg-secondary"
                >
                  {r?.timeIn ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[12.5px] text-muted-foreground">Absences, days off and overtime are set by an Executive.</p>
      {fixing && <FixTimesDialog member={mine} record={fixing.record} date={fixing.date} onClose={() => setFixing(null)} />}
    </section>
  );
}
