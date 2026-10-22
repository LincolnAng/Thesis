"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store/use-store";
import { deleteTimeRecord, saveTimeRecord } from "@/lib/store/store";
import { daysIn, extraHours, formatClock, hoursWorked, parseDay, type PayPeriod } from "@/lib/payroll/pay";
import type { DayStatus, StaffMember, TimeRecord } from "@/lib/store/types";

/**
 * The daily time record for a pay period: everyone down the side, the days across. Staff time
 * themselves in; here an Executive fills gaps, marks absences and days off, and approves
 * overtime — only approved hours are paid. Tap a day to change it.
 */

export const STATUS_INFO: Record<DayStatus, { short: string; label: string; cell: string }> = {
  present: { short: "✓", label: "Worked", cell: "bg-success/15 text-success" },
  half: { short: "½", label: "Half day", cell: "bg-[var(--status-warning)]/15 text-[var(--status-warning)]" },
  absent: { short: "A", label: "Absent", cell: "bg-danger/10 text-danger" },
  off: { short: "–", label: "Day off", cell: "bg-track text-muted-foreground" },
  leave: { short: "L", label: "Leave", cell: "bg-[#3F6E8C]/10 text-[#3F6E8C]" },
};

export function TimeRecordGrid({ period, people }: { period: PayPeriod; people: StaffMember[] }) {
  const { timeRecords } = useStore();
  const [open, setOpen] = useState<{ member: StaffMember; date: string } | null>(null);
  const days = daysIn(period);
  const rec = (s: StaffMember, d: string) => timeRecords.find((r) => r.staffId === s.id && r.date === d);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
        {(Object.keys(STATUS_INFO) as DayStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${STATUS_INFO[s].cell}`}>{STATUS_INFO[s].short}</span>
            {STATUS_INFO[s].label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[var(--status-warning)]" /> overtime to approve
        </span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line/15 bg-card">
        <table className="border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[120px] bg-card px-3 py-2 text-left font-semibold">Name</th>
              {days.map((d) => {
                const date = parseDay(d);
                const sunday = date.getDay() === 0;
                return (
                  <th key={d} className={`min-w-[38px] px-0.5 py-2 text-center font-medium ${sunday ? "text-danger/70" : "text-muted-foreground"}`}>
                    <span className="block text-[10px]">{date.toLocaleDateString("en-US", { weekday: "narrow" })}</span>
                    {date.getDate()}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {people.map((s) => (
              <tr key={s.id} className="border-t border-line/10">
                <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-semibold">{s.name}</td>
                {days.map((d) => {
                  const r = rec(s, d);
                  const waitingOt = r ? extraHours(r) > (r.otHours || 0) : false;
                  return (
                    <td key={d} className="p-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => setOpen({ member: s, date: d })}
                        aria-label={`${s.name}, ${d}: ${r ? STATUS_INFO[r.status].label : "nothing recorded"}`}
                        className={`relative flex h-9 w-9 items-center justify-center rounded-md text-[13px] font-bold transition hover:ring-2 hover:ring-cacao/40 ${r ? STATUS_INFO[r.status].cell : "bg-secondary/40 text-transparent"}`}
                      >
                        {r ? (r.timeIn && !r.timeOut && r.status === "present" ? "…" : STATUS_INFO[r.status].short) : "·"}
                        {r && r.otHours > 0 && <span className="absolute -bottom-0.5 right-0 text-[9px] font-bold text-cacao">+{r.otHours}</span>}
                        {waitingOt && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[var(--status-warning)]" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted-foreground">“…” means timed in but not out yet.</p>
      {open && <DayDialog member={open.member} date={open.date} record={rec(open.member, open.date) ?? null} onClose={() => setOpen(null)} />}
    </div>
  );
}

function DayDialog({ member, date, record, onClose }: { member: StaffMember; date: string; record: TimeRecord | null; onClose: () => void }) {
  const [status, setStatus] = useState<DayStatus>(record?.status ?? "present");
  const [timeIn, setTimeIn] = useState(record?.timeIn ?? "");
  const [timeOut, setTimeOut] = useState(record?.timeOut ?? "");
  const [ot, setOt] = useState(record?.otHours ? String(record.otHours) : "");
  const [note, setNote] = useState(record?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const working = status === "present" || status === "half";
  const hours = hoursWorked({ timeIn: timeIn || null, timeOut: timeOut || null });
  const extra = extraHours({ timeIn: timeIn || null, timeOut: timeOut || null });

  async function save() {
    if (working && timeIn && timeOut && timeOut <= timeIn) return setError("Time out has to be after time in.");
    const ok = await saveTimeRecord({
      ...(record ?? {}),
      staffId: member.id,
      date,
      status,
      timeIn: working ? timeIn || null : null,
      timeOut: working ? timeOut || null : null,
      otHours: working ? Math.max(0, Number(ot) || 0) : 0,
      note: note.trim(),
    });
    if (ok) onClose();
    else setError("It didn't save — check the internet, then try again.");
  }

  const field = "h-11 rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao";
  const longDate = parseDay(date).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{member.name}</DialogTitle>
          <DialogDescription>
            {longDate}
            {record?.loggedByName ? ` · last changed by ${record.loggedByName}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-1.5 min-[420px]:grid-cols-5">
          {(Object.keys(STATUS_INFO) as DayStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`min-h-11 rounded-lg border px-1 text-[13px] font-semibold ${status === s ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card"}`}
            >
              {STATUS_INFO[s].label}
            </button>
          ))}
        </div>
        {working && (
          <>
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
            {hours != null && (
              <p className="text-[13px] text-muted-foreground">
                {formatClock(timeIn)} to {formatClock(timeOut)} — {hours} hours worked (an hour off for lunch on a long day).
              </p>
            )}
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              Approved overtime (hours)
              <div className="flex items-center gap-2">
                <input inputMode="decimal" value={ot} onChange={(e) => setOt(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className={`${field} w-24 text-right`} />
                {extra > 0 && String(extra) !== ot && (
                  <button type="button" onClick={() => setOt(String(extra))} className="min-h-11 rounded-lg border border-[var(--status-warning)]/50 bg-[var(--status-warning)]/10 px-3 text-[13px] font-semibold text-[var(--status-warning)]">
                    Approve {extra} h from the clock
                  </button>
                )}
              </div>
              <span className="font-normal text-muted-foreground">Paid at 125% of the hourly rate. Only approved hours are paid.</span>
            </label>
          </>
        )}
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
        </label>
        {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => void save()} className="min-h-11 flex-1 rounded-[10px] bg-cacao text-[14px] font-semibold text-ivory">
            Save
          </button>
          {record && (
            <button
              type="button"
              onClick={() => {
                deleteTimeRecord(record.id);
                onClose();
              }}
              className="min-h-11 rounded-[10px] border border-danger/40 px-4 text-[14px] font-semibold text-danger"
            >
              Clear day
            </button>
          )}
          <button type="button" onClick={onClose} className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold">
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
