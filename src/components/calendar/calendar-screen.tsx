"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Page } from "@/components/layout/page";
import { BUTTON, Segmented, toggleButton } from "@/components/ui/kit";
import { CarouselNav } from "@/components/ui/carousel-nav";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EventPlanDialog } from "@/components/inventory/event-plan-dialog";
import { LeaveDialog, type LeaveRun } from "@/components/calendar/leave-dialog";
import { AgendaDialog } from "@/components/calendar/agenda-dialog";
import { updateCalendarItem } from "@/lib/store/store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, Plus } from "lucide-react";
import type { AgendaKind } from "@/lib/store/types";
import { PlanSettingsDialog } from "@/components/inventory/plan-settings-dialog";
import { useStore } from "@/lib/store/use-store";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { useCalendarEntries } from "@/lib/calendar/use-calendar-entries";
import { toIsoDate } from "@/lib/summary/production-schedule";
import { eventPlan } from "@/lib/summary/business-config";
import {
  AGENDA_KINDS,
  CATEGORY_LABELS,
  coversDay,
  type CalendarCategory,
  type CalendarEntry,
} from "@/lib/calendar/entries";

/**
 * The Calendar: one place to see what's happening on each day — suggested production, events,
 * shipments, day-offs, payments due and alerts — each read from the tab that owns it (see
 * lib/calendar/entries). Nothing is entered twice: an entry opens to its details and links
 * back to where it lives.
 *
 * Month is the default; week and day narrow it down. Tapping a day in the month opens that day,
 * which is where a day is marked off.
 */

type View = "month" | "week" | "day";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// What the calendar shows. Production, day-offs and stock alerts stay on Production and Home;
// what people add themselves (events, tasks, meetings, deadlines) shows with Events.
const ALL_CATEGORIES: CalendarCategory[] = ["events", "holidays", "leaves", "payments", "shipments"];
/** The filter an entry falls under: people's own items sit with Events. */
const filterOf = (c: CalendarCategory): CalendarCategory => (c === "agenda" ? "events" : c);

/** One colour per category, from the design tokens' palette, used for dots and chip edges. */
const CATEGORY_COLOR: Record<CalendarCategory, string> = {
  agenda: "#558A42",
  holidays: "#C2185B",
  production: "#7B4B2A",
  events: "#558A42",
  shipments: "#3F6E8C",
  dayoffs: "#9C9A92",
  leaves: "#7A5C99",
  payments: "#9A6B12",
  alerts: "#B3261E",
};


function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(iso: string, n: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}
/** Monday of the week `iso` falls in. */
function weekStart(iso: string): string {
  return addDays(iso, -((fromIso(iso).getDay() + 6) % 7));
}
const longDate = (iso: string) =>
  fromIso(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
const shortDate = (iso: string) => fromIso(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Dot({ category, color }: { category: CalendarCategory; color?: string }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color ?? CATEGORY_COLOR[category] }} />;
}

/** An entry's own colour (calendar items are coloured by kind), else its category's. */
const colorOf = (e: CalendarEntry) => e.color ?? CATEGORY_COLOR[e.category];

/** Who put a calendar item on the calendar — "you", or their name. */
const addedBy = (e: CalendarEntry, meId: string | undefined) =>
  e.item ? (e.item.ownerId === meId ? "you" : e.item.ownerName || "someone") : null;

/** A compact line in a month cell. */
function Chip({ entry, meId }: { entry: CalendarEntry; meId?: string }) {
  const by = addedBy(entry, meId);
  return (
    <span
      title={by ? `${entry.title} · added by ${by}` : entry.title}
      className="block truncate rounded px-1 py-px text-[10px] font-medium leading-tight"
      style={{ background: `${colorOf(entry)}1A`, color: colorOf(entry) }}
    >
      {entry.item?.done ? "✓ " : ""}
      {entry.title}
    </span>
  );
}

/**
 * A full row in the week and day lists; opens the detail sheet. Tinted in its category's
 * colour, with a solid edge, so a day's list reads at a glance the same way the month does.
 */
function EntryRow({ entry, meId, onOpen }: { entry: CalendarEntry; meId?: string; onOpen: (e: CalendarEntry) => void }) {
  const color = colorOf(entry);
  const by = addedBy(entry, meId);
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      style={{ background: `${color}14`, borderColor: `${color}40`, borderLeftColor: color }}
      className="flex min-h-11 w-full items-start gap-2.5 rounded-xl border border-l-4 px-3 py-2.5 text-left transition hover:brightness-95"
    >
      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] font-semibold ${entry.item?.done ? "text-muted-foreground line-through" : entry.tone === "bad" ? "text-danger" : "text-foreground"}`}>{entry.title}</span>
        {entry.subtitle && <span className="block text-[12px] text-muted-foreground">{entry.subtitle}</span>}
      </span>
      {by ? (
        <span className="shrink-0 rounded-full bg-card/80 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          By {by}
        </span>
      ) : (
        <span className="shrink-0 text-[11px] font-semibold" style={{ color }}>
          {CATEGORY_LABELS[entry.category]}
        </span>
      )}
    </button>
  );
}

export function CalendarScreen() {
  const store = useStore();
  const { products, events, businessSettings, loadedFromServer } = store;
  const me = useCurrentUser();
  const exec = isExecutive(me);
  const [agendaDialog, setAgendaDialog] = useState<{ item?: CalendarEntry["item"]; date: string; kind?: AgendaKind } | null>(null);
  const today = toIsoDate(new Date());

  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(today);
  // Payments are an executive's; an employee's data has none, so the filter isn't offered.
  const categories = exec ? ALL_CATEGORIES : ALL_CATEGORIES.filter((c) => c !== "payments");
  const [hidden, setHidden] = useState<Set<CalendarCategory>>(new Set());
  const [open, setOpen] = useState<CalendarEntry | null>(null);
  const [eventDialog, setEventDialog] = useState<{ eventId?: string; date?: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [leaveDialog, setLeaveDialog] = useState<{ existing?: LeaveRun; date: string } | null>(null);
  /** A leave entry's run, read back from its id ("leave:<staffId>:<start>") and dates. */
  const runOf = (e: CalendarEntry): LeaveRun | undefined => {
    if (e.category !== "leaves") return undefined;
    const [, staffId, start] = e.id.split(":");
    return { staffId, start, end: e.endDate ?? e.date, note: e.details.find((d) => d.label === "Reason")?.value ?? "" };
  };

  const { all } = useCalendarEntries();
  const eventPlans = useMemo(
    () => Object.fromEntries(events.map((e) => [e.id, eventPlan(businessSettings, e.id)])),
    [events, businessSettings],
  );

  const visible = all.filter((e) => categories.includes(filterOf(e.category)) && !hidden.has(filterOf(e.category)));
  // A day's entries: all-day ones first, then by time, like Google Calendar.
  const on = (date: string) =>
    visible.filter((e) => coversDay(e, date)).sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "") || Number(a.category !== "holidays") - Number(b.category !== "holidays"));

  // The days the current view covers.
  const month = fromIso(cursor);
  const monthDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => toIsoDate(new Date(first.getFullYear(), first.getMonth(), i + 1)));
  }, [month]);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart(cursor), i));
  const rangeDays = view === "month" ? monthDays : view === "week" ? weekDays : [cursor];

  const label =
    view === "month"
      ? month.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : view === "week"
        ? `${shortDate(weekDays[0])} – ${shortDate(weekDays[6])}`
        : longDate(cursor);

  // The calendar runs on forever, so the carousel's dots say where in the bigger period you are:
  // the month in its year, the week in its year, the day in its month.
  const position = (() => {
    const d = fromIso(view === "week" ? weekDays[0] : cursor);
    if (view === "month") return { index: month.getMonth(), count: 12 };
    if (view === "day") return { index: d.getDate() - 1, count: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() };
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const dec31 = new Date(d.getFullYear(), 11, 31);
    const weekOf = (x: Date) => Math.floor((x.getTime() - jan1.getTime()) / (7 * 86_400_000));
    return { index: weekOf(d), count: weekOf(dec31) + 1 };
  })();

  function step(n: number) {
    if (view === "month") {
      const d = new Date(month.getFullYear(), month.getMonth() + n, 1);
      setCursor(toIsoDate(d));
    } else setCursor(addDays(cursor, view === "week" ? 7 * n : n));
  }

  const countIn = (c: CalendarCategory) =>
    all.filter((e) => filterOf(e.category) === c && rangeDays.some((d) => coversDay(e, d))).length;

  return (
    <Page
      title="Calendar"
      right={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger className={`${BUTTON.primary} min-w-[120px]`}>
              <Plus className="h-4 w-4" strokeWidth={2.4} />
              Create
              <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-60">
              <DropdownMenuLabel className="text-[12px] text-muted-foreground">On the calendar</DropdownMenuLabel>
              {AGENDA_KINDS.map((k) => (
                <DropdownMenuItem key={k.kind} className="min-h-10" onSelect={() => setAgendaDialog({ date: view === "month" ? today : cursor, kind: k.kind })}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: k.color }} />
                  {k.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-10" onSelect={() => setEventDialog({ date: view === "day" ? cursor : undefined })}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLOR.events }} />
                Bazaar or event with stock to bring
              </DropdownMenuItem>
              {exec && (
                <DropdownMenuItem className="min-h-10" onSelect={() => setLeaveDialog({ date: view === "month" ? today : cursor })}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLOR.leaves }} />
                  Staff leave
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* View, dates, today */}
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Calendar view"
            value={view}
            onChange={setView}
            options={[
              { value: "month", label: "Month" },
              { value: "week", label: "Week" },
              { value: "day", label: "Day" },
            ]}
          />
          <CarouselNav
            label={label}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            labelWidth="w-[230px]"
            position={position}
            prevLabel={`Previous ${view}`}
            nextLabel={`Next ${view}`}
          />
          <button
            type="button"
            onClick={() => setCursor(today)}
            className={toggleButton(false)}
          >
            Today
          </button>
        </div>

        {/* Category filters, with how many of each the view holds */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show on the calendar">
          {categories.map((c) => {
            const shown = !hidden.has(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={shown}
                onClick={() =>
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (next.has(c)) next.delete(c);
                    else next.add(c);
                    return next;
                  })
                }
                // Same colours as the entries on the calendar, so a chip doubles as its legend.
                style={
                  shown
                    ? { background: `${CATEGORY_COLOR[c]}1A`, borderColor: `${CATEGORY_COLOR[c]}66`, color: CATEGORY_COLOR[c] }
                    : undefined
                }
                className={`flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition ${
                  shown ? "" : "border-dashed border-line/25 bg-card text-muted-foreground"
                }`}
              >
                <Dot category={c} />
                {CATEGORY_LABELS[c]}
                <span className="rounded-full bg-card/80 px-1.5 text-[11px] font-semibold tabular-nums">{countIn(c)}</span>
              </button>
            );
          })}
        </div>

        {!loadedFromServer && <p className="text-[13px] text-muted-foreground">Loading the shop&apos;s records…</p>}

        {view === "month" && (
          <div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-faint">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: (fromIso(monthDays[0]).getDay() + 6) % 7 }, (_, i) => (
                <span key={`lead-${i}`} />
              ))}
              {monthDays.map((date) => {
                const items = on(date);
                const past = date < today;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => {
                      setCursor(date);
                      setView("day");
                    }}
                    aria-label={`${longDate(date)}, ${items.length} ${items.length === 1 ? "item" : "items"}`}
                    className={`flex min-h-[76px] flex-col gap-0.5 overflow-hidden rounded-lg border p-1 text-left transition hover:border-cacao/40 min-[700px]:min-h-[96px] ${
                      past ? "border-transparent bg-track/60" : "border-line/10 bg-card"
                    } ${date === today ? "ring-2 ring-cacao" : ""}`}
                  >
                    <span className={`text-[11px] font-semibold ${past ? "text-muted-foreground" : "text-ink"}`}>
                      {Number(date.slice(8))}
                    </span>
                    {/* Phones get dots; wider screens get the first lines. */}
                    <span className="flex flex-wrap gap-0.5 min-[700px]:hidden">
                      {items.slice(0, 6).map((e) => (
                        <Dot key={e.id} category={e.category} />
                      ))}
                    </span>
                    <span className="hidden flex-col gap-0.5 min-[700px]:flex">
                      {items.slice(0, 3).map((e) => (
                        <Chip key={e.id} entry={e} meId={me?.id} />
                      ))}
                      {items.length > 3 && <span className="text-[10px] text-muted-foreground">+{items.length - 3} more</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">Tap a day to see everything on it, or to mark it as a day off.</p>
          </div>
        )}

        {view === "week" && (
          <div className="flex flex-col gap-3">
            {weekDays.map((date) => {
              const items = on(date);
              return (
                <div key={date} className={`rounded-2xl border p-3 ${date === today ? "border-cacao/50" : "border-line/15"} bg-card`}>
                  <button
                    type="button"
                    onClick={() => {
                      setCursor(date);
                      setView("day");
                    }}
                    className="mb-2 min-h-9 text-[13px] font-semibold hover:text-cacao"
                  >
                    {longDate(date)}
                  </button>
                  {items.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">Nothing on this day.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {items.map((e) => (
                        <EntryRow key={e.id} entry={e} meId={me?.id} onOpen={setOpen} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {view === "day" && (
          <div className="flex flex-col gap-3">
            {cursor >= today && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line/15 bg-card px-4 py-3">
                <button
                  type="button"
                  onClick={() => setAgendaDialog({ date: cursor })}
                  className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[13px] font-semibold"
                >
                  + Add on this day
                </button>
                {exec && (
                  <button
                    type="button"
                    onClick={() => setLeaveDialog({ date: cursor })}
                    className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[13px] font-semibold"
                  >
                    Someone on leave
                  </button>
                )}
              </div>
            )}
            {on(cursor).length === 0 ? (
              <div className="rounded-2xl border border-line/15 bg-card px-6 py-10 text-center text-sm text-muted-foreground">
                Nothing on this day{hidden.size > 0 ? " — some categories are hidden above" : ""}.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {on(cursor).map((e) => (
                  <EntryRow key={e.id} entry={e} meId={me?.id} onOpen={setOpen} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Dot category={open.category} color={open.color} />
                  {open.title}
                </DialogTitle>
                <DialogDescription>
                  {open.item ? `Added by ${addedBy(open, me?.id)}` : CATEGORY_LABELS[open.category]} · {open.endDate ? `${shortDate(open.date)} – ${shortDate(open.endDate)}` : longDate(open.date)}
                </DialogDescription>
              </DialogHeader>
              <dl className="flex flex-col gap-1.5 text-[14px]">
                {open.details.map((d, i) => (
                  <div key={`${d.label}-${i}`} className="flex justify-between gap-4 border-b border-line/10 py-1.5 last:border-0">
                    <dt className="text-muted-foreground">
                      {d.href ? (
                        <Link href={d.href} onClick={() => setOpen(null)} className="font-medium text-cacao underline decoration-dotted underline-offset-2">
                          {d.label}
                        </Link>
                      ) : (
                        d.label
                      )}
                    </dt>
                    <dd className="text-right font-medium">{d.value}</dd>
                  </div>
                ))}
              </dl>
              {open.item && open.item.ownerId === me?.id && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const item = open.item;
                      setOpen(null);
                      setAgendaDialog({ item, date: item!.date });
                    }}
                    className="flex min-h-11 flex-1 items-center justify-center rounded-[10px] bg-cacao px-4 text-[14px] font-semibold text-ivory"
                  >
                    Edit
                  </button>
                  {open.item.kind !== "event" && open.item.kind !== "meeting" && (
                    <button
                      type="button"
                      onClick={() => {
                        updateCalendarItem(open.item!.id, { done: !open.item!.done });
                        setOpen(null);
                      }}
                      className="min-h-11 flex-1 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold"
                    >
                      {open.item.done ? "Not done yet" : "Mark done"}
                    </button>
                  )}
                </div>
              )}
              {open.item && open.item.ownerId !== me?.id && (
                <p className="mt-2 text-[13px] text-muted-foreground">Shared with you by {open.item.ownerName}. Only they can change it.</p>
              )}
              {open.item && open.item.ownerId === me?.id && (
                <p className="text-[12.5px] text-muted-foreground">
                  {open.item.visibility === "private" ? "Only you see this." : open.item.visibility === "everyone" ? "Shared with everyone." : "Shared with the people you picked."}
                </p>
              )}
              {exec && open.category === "leaves" && (
                <button
                  type="button"
                  onClick={() => {
                    const run = runOf(open);
                    setOpen(null);
                    if (run) setLeaveDialog({ existing: run, date: run.start });
                  }}
                  className="mt-2 flex min-h-11 items-center justify-center rounded-[10px] bg-cacao px-4 text-[14px] font-semibold text-ivory"
                >
                  Change or remove this leave
                </button>
              )}
              {open.href && (
                <Link
                  href={open.href}
                  className="mt-2 flex min-h-11 items-center justify-center rounded-[10px] bg-cacao px-4 text-[14px] font-semibold text-ivory"
                  onClick={() => setOpen(null)}
                >
                  {open.hrefLabel ?? "Open"}
                </Link>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {showSettings && (
        <PlanSettingsDialog
          upcomingEvents={events.filter((e) => e.status === "open" && e.startDate && e.startDate.slice(0, 10) >= today)}
          eventPlans={eventPlans}
          onEditEvent={(id) => {
            setShowSettings(false);
            setEventDialog({ eventId: id });
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {agendaDialog && (
        <AgendaDialog
          key={agendaDialog.item?.id ?? `new-${agendaDialog.kind}`}
          existing={agendaDialog.item}
          defaultDate={agendaDialog.date}
          defaultKind={agendaDialog.kind}
          onClose={() => setAgendaDialog(null)}
        />
      )}
      {leaveDialog && <LeaveDialog existing={leaveDialog.existing} defaultDate={leaveDialog.date} onClose={() => setLeaveDialog(null)} />}
      {eventDialog && (
        <EventPlanDialog
          key={eventDialog.eventId ?? "new"}
          products={products}
          event={eventDialog.eventId ? events.find((e) => e.id === eventDialog.eventId) : undefined}
          plan={eventDialog.eventId ? eventPlans[eventDialog.eventId] : undefined}
          defaultDate={eventDialog.date}
          onClose={() => setEventDialog(null)}
        />
      )}
    </Page>
  );
}
