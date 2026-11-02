"use client";

import { useState } from "react";
import { Lock, Users, Globe2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store/use-store";
import { useCurrentUser } from "@/lib/auth/current-user";
import { addCalendarItem, deleteCalendarItem, updateCalendarItem } from "@/lib/store/store";
import { AGENDA_GROUPS, agendaKind, groupOfKind, type AgendaGroup } from "@/lib/calendar/entries";
import type { AgendaKind, AgendaVisibility, CalendarItem } from "@/lib/store/types";

/**
 * Putting anything on the calendar, the way Google Calendar does it: a title, what it is — an
 * event, a task or a payment (to collect or to pay), each its own colour — when — all day or from a time to a time, over one day or
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
  const group = groupOfKind(kind);
  // Switching group keeps an older item's own kind when it goes back to it; a payment starts as one to collect.
  const pickGroup = (g: AgendaGroup) =>
    setKind(g === groupOfKind(existing?.kind ?? "event") && existing ? existing.kind : g === "payment" ? "receivable" : g);
  const [date, setDate] = useState(existing?.date ?? defaultDate);
  const [endDate, setEndDate] = useState(existing?.endDate ?? "");
  const [allDay, setAllDay] = useState(existing ? !existing.startTime : true);
  const [startTime, setStartTime] = useState(existing?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "10:00");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [visibility, setVisibility] = useState<AgendaVisibility>(existing?.visibility ?? "private");
  const [sharedWith, setSharedWith] = useState<string[]>(existing?.sharedWith ?? []);
  const [done, setDone] = useState(existing?.done ?? false);
  const [error, setError] = useState<string | null>(null);

  const others = users.filter((u) => u.id !== me?.id);
  const placeholder =
    kind === "receivable"
      ? "e.g. Collect ₱5,000 from Vjandep"
      : kind === "payable"
        ? "e.g. Pay rent"
        : group === "task"
          ? "e.g. Deliver 50 packs to OTOP"
          : "e.g. Meet Aling Nena about a bulk order";

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
  const label = "flex flex-col gap-1 text-[13px] font-semibold";
  const chip = (on: boolean) => `flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition ${on ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card hover:border-cacao/50"}`;
  const ownerName = existing ? (existing.ownerId === me?.id ? "you" : existing.ownerName || "someone") : "you";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Change calendar item" : "Add to the calendar"}</DialogTitle>
          <DialogDescription>{existing ? `Added by ${ownerName}.` : "Saved under your name, so everyone can see who added it."}</DialogDescription>
        </DialogHeader>

        <label className={label}>
          What
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} className={field} />
        </label>

        <div className={label}>
          What it is
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What it is">
            {AGENDA_GROUPS.map((g) => (
              <button key={g.group} type="button" role="radio" aria-checked={group === g.group} onClick={() => pickGroup(g.group)} className={chip(group === g.group)}>
                {/* The colour it takes on the calendar. */}
                <span className="h-2.5 w-2.5 rounded-full ring-1 ring-card" style={{ background: g.color }} />
                {g.label}
              </button>
            ))}
          </div>
          {group === "payment" && (
            <div className="mt-1 flex gap-1.5" role="radiogroup" aria-label="Which way">
              {(
                [
                  ["receivable", "To collect"],
                  ["payable", "To pay"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
                  <span className="h-2.5 w-2.5 rounded-full ring-1 ring-card" style={{ background: agendaKind(k).color }} />
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Day
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label className={label}>
            Until (optional)
            <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} className={field} />
          </label>
          <label className="col-span-2 flex min-h-9 items-center gap-2 text-[14px]">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-5 w-5 accent-[var(--color-cacao)]" />
            All day
          </label>
          {!allDay && (
            <>
              <label className={label}>
                From
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={field} />
              </label>
              <label className={label}>
                To
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={field} />
              </label>
            </>
          )}
        </div>

        <label className={label}>
          Where (optional)
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Add a place" className={field} />
        </label>

        <label className={label}>
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-[15px] font-normal outline-none focus:border-cacao"
          />
        </label>

        <div className="flex flex-col gap-2 rounded-xl border border-line/15 bg-card p-3">
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
                className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-semibold transition ${visibility === v ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card hover:border-cacao/50"}`}
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

        {existing && group !== "event" && (
          <label className="flex min-h-11 items-center gap-2 text-[14px]">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} className="h-5 w-5 accent-[var(--color-cacao)]" />
            Done
          </label>
        )}

        {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={save} className="min-h-11 flex-1 rounded-[10px] bg-cacao text-[14px] font-semibold text-ivory transition hover:bg-cacao/90">
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
