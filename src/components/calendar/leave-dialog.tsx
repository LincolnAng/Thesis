"use client";

import { SearchSelect } from "@/components/ui/search-select";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store/use-store";
import { deleteTimeRecord, saveTimeRecord } from "@/lib/store/store";
import { daysIn } from "@/lib/payroll/pay";

/**
 * Putting someone on leave, from the Calendar. Each day is marked "Leave" on their time record
 * (Salaries), so it shows on the calendar and in payroll alike: unpaid for daily-rate staff,
 * not deducted for monthly staff. Executives only — whether a day counts is theirs to set.
 */

const REASONS = ["Sick leave", "Vacation", "Personal"];
const MAX_DAYS = 60;

export interface LeaveRun {
  staffId: string;
  start: string;
  end: string;
  note: string;
}

export function LeaveDialog({ existing, defaultDate, onClose }: { existing?: LeaveRun; defaultDate: string; onClose: () => void }) {
  const { staff, timeRecords } = useStore();
  const people = staff.filter((s) => s.active || s.id === existing?.staffId).sort((a, b) => a.name.localeCompare(b.name));
  const [staffId, setStaffId] = useState(existing?.staffId ?? people[0]?.id ?? "");
  const [start, setStart] = useState(existing?.start ?? defaultDate);
  const [end, setEnd] = useState(existing?.end ?? defaultDate);
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const leaveDays = (run: LeaveRun) =>
    timeRecords.filter((r) => r.staffId === run.staffId && r.status === "leave" && r.date >= run.start && r.date <= run.end);

  async function save() {
    if (!staffId) return setError("Pick who is on leave.");
    if (!start || !end || end < start) return setError("The last day can't be before the first.");
    const dates = daysIn({ start, end });
    if (dates.length > MAX_DAYS) return setError(`That's more than ${MAX_DAYS} days — check the dates.`);
    setSaving(true);
    // Changing a leave: days no longer in it go back to blank.
    if (existing) for (const r of leaveDays(existing)) if (r.staffId !== staffId || !dates.includes(r.date)) deleteTimeRecord(r.id);
    const results = await Promise.all(
      dates.map((date) => {
        const current = timeRecords.find((r) => r.staffId === staffId && r.date === date);
        return saveTimeRecord({ ...(current ?? {}), staffId, date, status: "leave", timeIn: null, timeOut: null, otHours: 0, note: note.trim() });
      }),
    );
    setSaving(false);
    if (results.every(Boolean)) onClose();
    else setError("Some days didn't save — check the internet, then try again.");
  }

  function remove() {
    if (!existing) return;
    for (const r of leaveDays(existing)) deleteTimeRecord(r.id);
    onClose();
  }

  const field = "h-11 rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao";
  const label = "flex flex-col gap-1 text-[13px] font-semibold";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Change leave" : "Add leave"}</DialogTitle>
          <DialogDescription>Shows on the calendar and on their time record in Salaries.</DialogDescription>
        </DialogHeader>
        {people.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">Add staff first, under Salaries → Staff.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className={`${label} col-span-2`}>
              Who
              <SearchSelect value={staffId} onChange={setStaffId} options={people.map((s) => ({ value: s.id, label: s.name }))} placeholder="Choose someone" ariaLabel="Who" />
            </div>
            <label className={label}>
              First day
              <input
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (end < e.target.value) setEnd(e.target.value);
                }}
                className={field}
              />
            </label>
            <label className={label}>
              Last day
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={field} />
            </label>
            <div className={`${label} col-span-2`}>
              Reason
              <div className="flex flex-wrap gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setNote(r)}
                    className={`min-h-10 rounded-full border px-3.5 text-[13px] font-semibold ${note === r ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Or type a reason" className={field} />
            </div>
          </div>
        )}
        {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={saving || people.length === 0} onClick={() => void save()} className="min-h-11 flex-1 rounded-[10px] bg-cacao text-[14px] font-semibold text-ivory disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
          {existing && (
            <button type="button" onClick={remove} className="min-h-11 rounded-[10px] border border-danger/40 px-4 text-[14px] font-semibold text-danger">
              Remove leave
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
