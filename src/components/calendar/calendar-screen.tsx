"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Page } from "@/components/layout/page";
import { BUTTON, Segmented, toggleButton } from "@/components/ui/kit";
import { CarouselNav } from "@/components/ui/carousel-nav";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EventPlanDialog } from "@/components/inventory/event-plan-dialog";
import { PlanSettingsDialog } from "@/components/inventory/plan-settings-dialog";
import { useStore } from "@/lib/store/use-store";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { useCalendarEntries } from "@/lib/calendar/use-calendar-entries";
import { STRATEGY_HINTS, STRATEGY_LABELS, toIsoDate, type ScheduleStrategy } from "@/lib/summary/production-schedule";
import {
  eventPlan,
  toggleUnavailableDay,
  unavailableDays,
} from "@/lib/summary/business-config";
import {
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

const STRATEGIES: ScheduleStrategy[] = ["fastest", "balanced", "min_expiry"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ALL_CATEGORIES: CalendarCategory[] = ["production", "events", "shipments", "dayoffs", "payments", "alerts"];

/** One colour per category, from the design tokens' palette, used for dots and chip edges. */
const CATEGORY_COLOR: Record<CalendarCategory, string> = {
  production: "#7B4B2A",
  events: "#558A42",
  shipments: "#3F6E8C",
  dayoffs: "#9C9A92",
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

function Dot({ category }: { category: CalendarCategory }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[category] }} />;
}

/** A compact line in a month cell. */
function Chip({ entry }: { entry: CalendarEntry }) {
  return (
    <span
      className="block truncate rounded px-1 py-px text-[10px] font-medium leading-tight"
      style={{ background: `${CATEGORY_COLOR[entry.category]}1A`, color: CATEGORY_COLOR[entry.category] }}
    >
      {entry.title}
    </span>
  );
}

/**
 * A full row in the week and day lists; opens the detail sheet. Tinted in its category's
 * colour, with a solid edge, so a day's list reads at a glance the same way the month does.
 */
function EntryRow({ entry, onOpen }: { entry: CalendarEntry; onOpen: (e: CalendarEntry) => void }) {
  const color = CATEGORY_COLOR[entry.category];
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      style={{ background: `${color}14`, borderColor: `${color}40`, borderLeftColor: color }}
      className="flex min-h-11 w-full items-start gap-2.5 rounded-xl border border-l-4 px-3 py-2.5 text-left transition hover:brightness-95"
    >
      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] font-semibold ${entry.tone === "bad" ? "text-danger" : "text-foreground"}`}>{entry.title}</span>
        {entry.subtitle && <span className="block text-[12px] text-muted-foreground">{entry.subtitle}</span>}
      </span>
      <span className="shrink-0 text-[11px] font-semibold" style={{ color }}>
        {CATEGORY_LABELS[entry.category]}
      </span>
    </button>
  );
}

export function CalendarScreen() {
  const store = useStore();
  const { products, events, businessSettings, loadedFromServer } = store;
  const exec = isExecutive(useCurrentUser());
  const today = toIsoDate(new Date());

  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(today);
  const [strategy, setStrategy] = useState<ScheduleStrategy>("fastest");
  // Payments are an executive's; an employee's data has none, so the filter isn't offered.
  const categories = exec ? ALL_CATEGORIES : ALL_CATEGORIES.filter((c) => c !== "payments");
  const [hidden, setHidden] = useState<Set<CalendarCategory>>(new Set());
  const [open, setOpen] = useState<CalendarEntry | null>(null);
  const [eventDialog, setEventDialog] = useState<{ eventId?: string; date?: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const { all, plan } = useCalendarEntries(strategy);
  const eventPlans = useMemo(
    () => Object.fromEntries(events.map((e) => [e.id, eventPlan(businessSettings, e.id)])),
    [events, businessSettings],
  );
  const offDays = unavailableDays(businessSettings);

  const visible = all.filter((e) => categories.includes(e.category) && !hidden.has(e.category));
  const on = (date: string) => visible.filter((e) => coversDay(e, date));
  const lastPlannedDay = plan.days.at(-1)?.date;

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
    all.filter((e) => e.category === c && rangeDays.some((d) => coversDay(e, d))).length;
  const beyondPlan = Boolean(lastPlannedDay && rangeDays.some((d) => d > lastPlannedDay));

  return (
    <Page
      title="Calendar"
      right={
        <>
          {exec && (
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className={BUTTON.secondary}
            >
              Plan settings
            </button>
          )}
          <button
            type="button"
            onClick={() => setEventDialog({ date: view === "day" ? cursor : undefined })}
            className={BUTTON.primary}
          >
            + Add event
          </button>
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

        {/* How the suggested production is laid out */}
        {!hidden.has("production") && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-muted-foreground">Suggested production</span>
            <Segmented
              label="Suggested production"
              value={strategy}
              onChange={setStrategy}
              options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_LABELS[s], title: STRATEGY_HINTS[s] }))}
            />
            <span className="text-muted-foreground">{STRATEGY_HINTS[strategy]}</span>
          </div>
        )}

        {!loadedFromServer && <p className="text-[13px] text-muted-foreground">Loading the shop&apos;s records…</p>}
        {beyondPlan && !hidden.has("production") && lastPlannedDay && (
          <p className="text-[12px] text-muted-foreground">
            Suggested production is worked out up to {shortDate(lastPlannedDay)}; later days show everything else.
          </p>
        )}

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
                const off = offDays.includes(date);
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
                      off
                        ? "border-dashed border-line/25 bg-[repeating-linear-gradient(135deg,#EDEBE3_0_5px,transparent_5px_10px)]"
                        : past
                          ? "border-transparent bg-track/60"
                          : "border-line/10 bg-card"
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
                        <Chip key={e.id} entry={e} />
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
                    {offDays.includes(date) && <span className="ml-2 text-[11px] font-semibold text-muted-foreground">Day off</span>}
                  </button>
                  {items.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">Nothing on this day.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {items.map((e) => (
                        <EntryRow key={e.id} entry={e} onOpen={setOpen} />
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
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line/15 bg-card px-4 py-3">
                <span className="text-[13px] text-muted-foreground">
                  {offDays.includes(cursor) ? "This is a day off — nothing is planned for it." : "A working day."}
                </span>
                <button
                  type="button"
                  onClick={() => toggleUnavailableDay(businessSettings, cursor)}
                  className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[13px] font-semibold"
                >
                  {offDays.includes(cursor) ? "Make it a working day" : "Mark as day off"}
                </button>
              </div>
            )}
            {on(cursor).length === 0 ? (
              <div className="rounded-2xl border border-line/15 bg-card px-6 py-10 text-center text-sm text-muted-foreground">
                Nothing on this day{hidden.size > 0 ? " — some categories are hidden above" : ""}.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {on(cursor).map((e) => (
                  <EntryRow key={e.id} entry={e} onOpen={setOpen} />
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
                  <Dot category={open.category} />
                  {open.title}
                </DialogTitle>
                <DialogDescription>
                  {CATEGORY_LABELS[open.category]} · {open.endDate ? `${shortDate(open.date)} – ${shortDate(open.endDate)}` : longDate(open.date)}
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
