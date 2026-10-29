"use client";

import { useEffect, useState } from "react";
import { Clock, Coffee, LogIn, LogOut, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store/use-store";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { saveTimeRecord } from "@/lib/store/store";
import { breakOverMinutes, formatClock, hoursWorked, manilaTime, manilaToday } from "@/lib/payroll/pay";
import type { StaffMember, TimeRecord } from "@/lib/store/types";

/**
 * Today's time in and out, one big button per person. An employee sees only themselves (the
 * server sends no one else's name or times); Executives see everyone, at the top of the time
 * record. The time is the clock's — Philippine time. Employees can fix their own times this pay
 * period (see MyDays); anyone's, any day, is an Executive's to change.
 */

const longToday = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });
};

function hoursLabel(r: TimeRecord): string | null {
  const h = hoursWorked(r);
  if (h == null) return null;
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return `${whole}h${mins ? ` ${mins}m` : ""} worked`;
}

type Step = { what: "in" | "breakStart" | "breakEnd" | "out"; label: string; main: boolean };

/** The next step of someone's day: in → start break → end break → out. */
function nextSteps(r: TimeRecord | null): Step[] {
  if (!r?.timeIn) return [{ what: "in", label: "Time in", main: true }];
  if (r.breakStart && !r.breakEnd) return [{ what: "breakEnd", label: "End break", main: true }];
  return [...(!r.breakStart ? [{ what: "breakStart" as const, label: "Start break", main: false }] : []), { what: "out", label: "Time out", main: false }];
}

export function TimeInPanel() {
  const { staff, timeRecords, loadedFromServer } = useStore();
  const me = useCurrentUser();
  const [now, setNow] = useState(() => new Date());
  const [fixing, setFixing] = useState<{ member: StaffMember; record: TimeRecord | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  const today = manilaToday(now);
  // Whoever is linked to this profile comes first, marked "You".
  const people = staff
    .filter((s) => s.active)
    .sort((a, b) => Number(b.userId === me?.id) - Number(a.userId === me?.id) || a.name.localeCompare(b.name));
  const recordOf = (s: StaffMember) => timeRecords.find((r) => r.staffId === s.id && r.date === today) ?? null;

  /** Time in, break start, break end or time out — whichever comes next — stamped with the time now. */
  async function clock(member: StaffMember, record: TimeRecord | null, what: "in" | "breakStart" | "breakEnd" | "out") {
    setBusy(member.id);
    setFailed(null);
    const time = manilaTime();
    const ok = await saveTimeRecord(
      record
        ? { ...record, ...(what === "breakStart" ? { breakStart: time } : what === "breakEnd" ? { breakEnd: time } : { timeOut: time }) }
        : { staffId: member.id, date: today, timeIn: time, timeOut: null, breakStart: null, breakEnd: null, status: "present", otHours: 0, note: "" },
    );
    setBusy(null);
    if (!ok) setFailed(`${member.name}'s time didn't save — check the internet, then try again.`);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[20px] font-semibold">{longToday(today)}</h2>
        <span className="flex items-center gap-1.5 text-[15px] font-semibold tabular-nums text-cacao">
          <Clock className="h-4 w-4" />
          {formatClock(manilaTime(now))}
        </span>
      </div>

      {people.length === 0 ? (
        <p className="rounded-2xl border border-line/15 bg-card px-4 py-6 text-center text-[14px] text-muted-foreground">
          {!loadedFromServer
            ? "Loading…"
            : isExecutive(me)
              ? "No staff yet. Add them under Staff."
              : "No staff yet. An Executive adds them under Salaries → Staff."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/15 bg-card">
          {people.map((member) => {
            const r = recordOf(member);
            const done = Boolean(r?.timeIn && r?.timeOut);
            const notWorking = r && (r.status === "absent" || r.status === "off" || r.status === "leave");
            return (
              <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold">
                    {member.name}
                    {member.userId && member.userId === me?.id && <span className="ml-2 rounded-full bg-cacao/10 px-2 py-0.5 text-[11px] font-bold text-cacao">You</span>}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {notWorking
                      ? { absent: "Absent today", off: "Day off", leave: "On leave" }[r.status as "absent" | "off" | "leave"]
                      : r?.timeIn
                        ? [
                            `In ${formatClock(r.timeIn)}`,
                            r.breakStart ? `Break ${formatClock(r.breakStart)}–${r.breakEnd ? formatClock(r.breakEnd) : "now"}` : null,
                            `Out ${r.timeOut ? formatClock(r.timeOut) : "—"}`,
                            done && hoursLabel(r) ? hoursLabel(r) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "Not in yet"}
                    {r && breakOverMinutes(r) > 0 && (
                      <span className="ml-1 font-semibold text-[var(--status-warning)]">· break {breakOverMinutes(r)} min over</span>
                    )}
                  </p>
                </div>
                {!notWorking && !done && (
                  <span className="flex flex-wrap gap-2">
                    {nextSteps(r).map((st) => (
                      <button
                        key={st.what}
                        type="button"
                        disabled={busy === member.id}
                        onClick={() => void clock(member, r, st.what)}
                        className={`flex min-h-12 min-w-[130px] items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-bold transition disabled:opacity-50 ${
                          st.main ? "bg-cacao text-ivory" : "border-2 border-cacao bg-card text-cacao"
                        }`}
                      >
                        {st.what === "in" ? <LogIn className="h-5 w-5" /> : st.what === "out" ? <LogOut className="h-5 w-5" /> : <Coffee className="h-5 w-5" />}
                        {st.label}
                      </button>
                    ))}
                  </span>
                )}
                {(r?.timeIn || done) && !notWorking && (
                  <button
                    type="button"
                    onClick={() => setFixing({ member, record: r })}
                    aria-label={`Fix ${member.name}'s times`}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-line/20 text-muted-foreground hover:bg-secondary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {failed && <p className="text-[13px] font-semibold text-danger">{failed}</p>}

      {fixing && (
        <FixTimesDialog
          member={fixing.member}
          record={fixing.record}
          date={today}
          onClose={() => setFixing(null)}
        />
      )}
    </section>
  );
}

export function FixTimesDialog({ member, record, date, onClose }: { member: StaffMember; record: TimeRecord | null; date: string; onClose: () => void }) {
  const me = useCurrentUser();
  const [timeIn, setTimeIn] = useState(record?.timeIn ?? "");
  const [timeOut, setTimeOut] = useState(record?.timeOut ?? "");
  const [breakStart, setBreakStart] = useState(record?.breakStart ?? "");
  const [breakEnd, setBreakEnd] = useState(record?.breakEnd ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!timeIn) return setError("Enter the time in.");
    if (timeOut && timeOut <= timeIn) return setError("Time out has to be after time in.");
    if (breakStart && breakEnd && breakEnd <= breakStart) return setError("The break has to end after it starts.");
    const ok = await saveTimeRecord({
      ...(record ?? { staffId: member.id, date, status: "present" as const, otHours: 0, note: "" }),
      timeIn,
      timeOut: timeOut || null,
      breakStart: breakStart || null,
      breakEnd: breakEnd || null,
    });
    if (ok) onClose();
    else setError("It didn't save — check the internet, then try again.");
  }

  const field = "h-12 rounded-lg border border-input bg-transparent px-3 text-[16px] outline-none focus:border-cacao";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{record?.timeIn ? `Fix ${member.name}'s times` : `Put in ${member.name}'s times`}</DialogTitle>
          <DialogDescription>
            {longToday(date)}. Saved with your name.
            {isExecutive(me) ? "" : " Only days in this pay period can be changed here; anything earlier, an Executive changes."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            Time in
            <input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            Time out
            <input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} className={field} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            Break start
            <input type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            Break end
            <input type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} className={field} />
          </label>
        </div>
        <p className="-mt-1 text-[12px] text-muted-foreground">A 30-minute break is allowed; anything longer comes off pay.</p>
        {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => void save()} className="min-h-11 flex-1 rounded-[10px] bg-cacao text-[14px] font-semibold text-ivory">
            Save
          </button>
          <button type="button" onClick={onClose} className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold">
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
