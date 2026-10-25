"use client";

import { useState } from "react";
import { Clock, Lock, MapPin, Users, Globe2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store/use-store";
import { useCurrentUser } from "@/lib/auth/current-user";
import { addCalendarItem, deleteCalendarItem, updateCalendarItem } from "@/lib/store/store";
import { AGENDA_KINDS } from "@/lib/calendar/entries";
import type { AgendaKind, AgendaVisibility, CalendarItem } from "@/lib/store/types";

/**
 * Putting anything on the calendar, the way Google Calendar does it: a title, what kind of thing
 * it is (each kind its own colour), when — all day or from a time to a time, over one day or
 * several — where, notes, and who sees it: only me, everyone, or the people picked. Nothing
 * here is limited to a list: a task can be anything.
 */
export function AgendaDialog({
  existing,
  defaultDate,
  defaultKind = "event",
  onClose,
}: {
  existing?: CalendarItem;
  defaultDate: string;
  defaultKind?: AgendaKind;
  onClose: () => void;
}) {
  const { users } = useStore();
  const me = useCurrentUser();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [kind, setKind] = useState<AgendaKind>(existing?.kind ?? defaultKind);
  const [date, setDate] = useState(existing?.date ?? defaultDate);
  const [endDate, setEndDate] = useState(existing?.endDate ?? "");
  const [allDay, setAllDay] = useState(existing ? !existing.startTime : defaultKind !== "meeting");
  const [startTime, setStartTime] = useState(existing?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "10:00");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [visibility, setVisibility] = useState<AgendaVisibility>(existing?.visibility ?? "private");
  const [sharedWith, setSharedWith] = useState<string[]>(existing?.sharedWith ?? []);
  const [done, setDone] = useState(existing?.done ?? false);
  const [error, setError] = useState<string | null>(null);

  const others = users.filter((u) => u.id !== me?.id);
  const color = AGENDA_KINDS.find((k) => k.kind === kind)?.color ?? "#1A73E8";
  const placeholder: Record<AgendaKind, string> = {
    event: "e.g. Christmas bazaar at SM",
    task: "e.g. Call the jar supplier",
    meeting: "e.g. Meet Aling Nena about bulk order",
    delivery: "e.g. Deliver 50 jars to Robinsons",
    receivable: "e.g. Collect ₱5,000 from King Kong",
    payable: "e.g. Pay rent",
    reminder: "e.g. Renew business permit",
  };

  function save() {
    if (!title.trim()) return setError("Add a title.");
    if (!date) return setError("Pick the day.");
    if (endDate && endDate < date) return setError("The last day can't be before the first.");
    if (!allDay && startTime && endTime && endTime <= startTime && !endDate) return setError("The end time has to be after the start.");
    if (visibility === "people" && sharedWith.length === 0) return setError("Pick who to share it with, or choose Only me.");
    const data = {
      title: title.trim(),
      kind,
      date,
      endDate: endDate && endDate > date ? endDate : null,
      startTime: allDay ? null : startTime || null,
      endTime: allDay ? null : endTime || null,
      location: location.trim(),
      notes: notes.trim(),
      visibility,
      sharedWith: visibility === "people" ? sharedWith : [],
      done,
    };
    if (existing) updateCalendarItem(existing.id, data);
    else addCalendarItem(data);
    onClose();
  }

  const field = "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao";
  const row = "flex items-start gap-3";
  const icon = "mt-3 h-4 w-4 shrink-0 text-muted-foreground";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">{existing ? "Change calendar item" : "Add to the calendar"}</DialogTitle>
          <DialogDescription className="sr-only">Title, kind, when, where and who sees it.</DialogDescription>
        </DialogHeader>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={placeholder[kind]}
          aria-label="Title"
          className="w-full border-b-2 bg-transparent pb-1.5 font-display text-[22px] outline-none placeholder:text-muted-foreground/60"
          style={{ borderColor: color }}
        />

        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind">
          {AGENDA_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={kind === k.kind}
              onClick={() => setKind(k.kind)}
              className="flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition"
              style={kind === k.kind ? { background: k.color, borderColor: k.color, color: "#fff" } : { borderColor: `${k.color}55`, color: k.color }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: kind === k.kind ? "#fff" : k.color }} />
              {k.label}
            </button>
          ))}
        </div>

        <div className={row}>
          <Clock className={icon} />
          <div className="flex flex-1 flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted-foreground">
                Day
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted-foreground">
                Until (optional)
                <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} className={field} />
              </label>
            </div>
            <label className="flex min-h-9 items-center gap-2 text-[14px]">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-5 w-5" />
              All day
            </label>
            {!allDay && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted-foreground">
                  From
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={field} />
                </label>
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted-foreground">
                  To
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={field} />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className={row}>
          <MapPin className={icon} />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Add a place" aria-label="Where" className={field} />
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Notes (optional)"
          aria-label="Notes"
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-[15px] outline-none focus:border-cacao"
        />

        <div className="flex flex-col gap-2 rounded-xl bg-secondary/60 p-3">
          <span className="text-[13px] font-semibold">Who sees this</span>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ["private", "Only me", Lock],
                ["everyone", "Everyone", Globe2],
                ["people", "Pick people", Users],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                aria-pressed={visibility === v}
                className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-semibold ${visibility === v ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card"}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          {visibility === "people" && (
            <div className="flex flex-wrap gap-1.5">
              {others.length === 0 && <span className="text-[13px] text-muted-foreground">No one else has a profile yet.</span>}
              {others.map((u) => {
                const on = sharedWith.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => setSharedWith((prev) => (on ? prev.filter((x) => x !== u.id) : [...prev, u.id]))}
                    className={`min-h-9 rounded-full border px-3 text-[13px] font-semibold ${on ? "border-cacao bg-cacao/10 text-cacao" : "border-line/20 bg-card"}`}
                  >
                    {on ? "✓ " : ""}
                    {u.name}
                  </button>
                );
              })}
            </div>
          )}
          <span className="text-[12px] text-muted-foreground">
            {visibility === "private" ? "Only you see it, on your calendar and your Today at a glance." : visibility === "everyone" ? "Everyone sees it on their calendar." : "Only you and the people picked see it."}
          </span>
        </div>

        {existing && (kind === "task" || kind === "delivery" || kind === "receivable" || kind === "payable" || kind === "reminder") && (
          <label className="flex min-h-11 items-center gap-2 text-[14px]">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} className="h-5 w-5" />
            Done
          </label>
        )}

        {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={save} className="min-h-11 flex-1 rounded-[10px] text-[14px] font-semibold text-white" style={{ background: color }}>
            Save
          </button>
          {existing && (
            <button
              type="button"
              onClick={() => {
                deleteCalendarItem(existing.id);
                onClose();
              }}
              className="min-h-11 rounded-[10px] border border-danger/40 px-4 text-[14px] font-semibold text-danger"
            >
              Delete
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
