"use client";

import Link from "next/link";
import { CalendarDays, Check, ChevronRight, Clock, Factory, HandCoins, ListChecks, PackageX, PartyPopper, ShoppingCart, TrendingDown, UsersRound, Wallet } from "lucide-react";
import { useReminders } from "@/lib/reminders/use-reminders";
import { GROUP_LABELS, GROUP_ORDER, STOCK_GROUPS, groupOf, isNoWork, type Reminder, type ReminderGroup } from "@/lib/reminders/reminders";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { setTaskDone, updateCalendarItem } from "@/lib/store/store";
import { manilaToday } from "@/lib/payroll/pay";
import { useStore } from "@/lib/store/use-store";
import { formatPeso } from "@/lib/format";
import { dayKey } from "@/lib/home/today";

/**
 * Today at a glance, on Home: a plain task list — what to do today, in a few words each, with a
 * box to tick — grouped by what it's about (money, salaries, your own calendar, production,
 * events, staff), then the stock warnings by kind (running low, expiring, to buy), then what's
 * coming up. Built from lib/reminders, which reads the
 * Calendar and every tab behind it, so it's personal: each person sees their own calendar items
 * and what was shared with them, and a task disappears once it's dealt with.
 *
 * It's the whole company's list: ticking a task crosses it out for today for everyone, on every
 * device, with who did it — saved in the sheet (Logs → "Task done"). Ticking one of your own
 * calendar items marks the item itself done. Crossing out doesn't do the task: paying,
 * collecting or restocking is still done on its own tab, which the arrow opens.
 */

const GROUP_ICON: Record<ReminderGroup, React.ReactNode> = {
  money: <HandCoins className="h-3.5 w-3.5" />,
  salaries: <Wallet className="h-3.5 w-3.5" />,
  agenda: <CalendarDays className="h-3.5 w-3.5" />,
  production: <Factory className="h-3.5 w-3.5" />,
  events: <PartyPopper className="h-3.5 w-3.5" />,
  staff: <UsersRound className="h-3.5 w-3.5" />,
  low: <TrendingDown className="h-3.5 w-3.5" />,
  expiring: <Clock className="h-3.5 w-3.5" />,
  buy: <ShoppingCart className="h-3.5 w-3.5" />,
  stock: <PackageX className="h-3.5 w-3.5" />,
};

const dateOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** "Holiday: All Saints' Day" reads as just the name under a red holiday circle. */
const upcomingTitle = (r: Reminder) => (r.category === "holidays" ? r.title.replace(/^Holiday:\s*/i, "") : r.title);

/**
 * Coming up, a card per day: the weekday and month, the date in a circle — filled red with a
 * white number on a day nobody works (a holiday or a day off) — and that day's entries under it.
 * Days off show through the end of next month; everything else, the next few days. The cards wrap and stretch to
 * fill each row, so two days or seven sit evenly instead of leaving a gap.
 */
function ComingUp({ upcoming }: { upcoming: Reminder[] }) {
  const days = new Map<string, Reminder[]>();
  for (const r of upcoming) days.set(r.date, [...(days.get(r.date) ?? []), r]);
  return (
    <ul className="flex flex-wrap gap-2">
      {[...days].map(([date, items]) => {
        const d = dateOf(date);
        const noWork = items.some(isNoWork);
        // Holidays and days off first: they're why the circle is red.
        const sorted = [...items].sort((a, b) => Number(isNoWork(b)) - Number(isNoWork(a)));
        return (
          <li key={date} className="flex min-w-[104px] flex-[1_1_104px] flex-col items-center gap-1.5 rounded-xl border border-line/10 bg-secondary/30 px-2.5 py-2.5 text-center">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {d.toLocaleDateString("en-PH", { weekday: "short" })} · {d.toLocaleDateString("en-PH", { month: "short" })}
            </span>
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full text-[17px] font-bold tabular-nums ${
                noWork ? "bg-danger text-white" : "bg-card text-foreground ring-1 ring-line/20"
              }`}
              aria-label={noWork ? `${d.getDate()}, no work` : undefined}
            >
              {d.getDate()}
            </span>
            <ul className="flex w-full flex-col gap-1 text-[13px] leading-snug">
              {sorted.map((r) => (
                <li key={r.id} className={isNoWork(r) ? "font-semibold text-danger" : "text-foreground"}>
                  {upcomingTitle(r)}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function Task({ r, done, by, onTick }: { r: Reminder; done: boolean; by?: string; onTick: () => void }) {
  const urgent = !done && r.tone === "bad";
  return (
    <li className="flex min-h-12 items-center gap-2.5 border-b border-line/10 py-1.5 last:border-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Untick: ${r.title}` : `Tick off: ${r.title}`}
        onClick={onTick}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition ${
          done ? "border-success bg-success text-white" : urgent ? "border-danger" : "border-line/40 hover:border-cacao"
        }`}
      >
        {done && <Check className="h-4 w-4" strokeWidth={3} />}
      </button>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-semibold leading-snug ${done ? "text-muted-foreground line-through" : urgent ? "text-danger" : "text-foreground"}`}>{r.title}</span>
        {r.detail && !done && <span className={`block text-[12.5px] ${urgent ? "text-danger/80" : "text-muted-foreground"}`}>{r.detail}</span>}
        {done && by && <span className="block text-[12px] text-success">Done by {by}</span>}
      </span>
      {r.href && (
        <Link href={r.href} aria-label={`Open: ${r.title}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary">
          <ChevronRight className="h-5 w-5" />
        </Link>
      )}
    </li>
  );
}

function Heading({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return <h3 className="mb-0.5 mt-1 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">{icon}{children}</h3>;
}

/** Today at a glance — the task list on Home. */
export function TodayTasks() {
  const { today, upcoming } = useReminders();
  const { entries, calendarItems, taskTicks } = useStore();
  const me = useCurrentUser();
  const exec = isExecutive(me);

  // One's own calendar items are ticked off for real; anything else is crossed out for today,
  // for everyone (the same day everywhere: Manila's).
  const day = manilaToday();
  const mine = (r: Reminder) => (r.itemId ? calendarItems.find((c) => c.id === r.itemId && c.ownerId === me?.id) : undefined);
  const tickOf = (r: Reminder) => taskTicks.find((t) => t.taskId === r.id && t.day === day);
  const isDone = (r: Reminder) => Boolean(tickOf(r));
  const tick = (r: Reminder) => {
    const own = mine(r);
    if (own) updateCalendarItem(own.id, { done: !own.done });
    else setTaskDone(r.id, r.title, day, !isDone(r));
  };

  // Not-done first; ticked ones sink to the bottom of their group.
  const order = (list: Reminder[]) => [...list].sort((a, b) => Number(isDone(a)) - Number(isDone(b)));
  const groups = GROUP_ORDER.map((g) => ({ g, items: order(today.filter((r) => groupOf(r) === g)) })).filter((x) => x.items.length > 0);
  const left = today.filter((r) => !isDone(r) && !STOCK_GROUPS.has(groupOf(r))).length;

  const todayIso = dayKey(new Date());
  const salesToday = entries.filter((e) => e.type === "SALE" && dayKey(e.timestamp) === todayIso).reduce((n, e) => n + (e.amount ?? 0), 0);

  return (
    <section
      aria-labelledby="today-glance"
      className="rounded-2xl border border-line/15 bg-card p-4 min-[640px]:p-5 min-[1280px]:max-h-[calc(100svh-120px)] min-[1280px]:overflow-y-auto"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-glance" className="flex items-center gap-2 font-display text-[22px] font-semibold">
          <ListChecks className="h-5 w-5 text-cacao" strokeWidth={2} />
          Today at a glance
        </h2>
        <span className="text-[13px] font-semibold text-muted-foreground">{left === 0 ? "All done" : `${left} to do`}</span>
      </div>
      {exec && <p className="mb-2 text-[13px] text-muted-foreground">Sold {formatPeso(salesToday)} today</p>}

      {groups.length === 0 ? (
        <p className="rounded-xl bg-success/10 px-3 py-2.5 text-[14px] font-medium text-success">Nothing to do today.</p>
      ) : (
        groups.map(({ g, items }) => (
          <div key={g} className="mt-3 first:mt-1">
            <Heading icon={GROUP_ICON[g]}>{GROUP_LABELS[g]}</Heading>
            <ul>
              {items.map((r) => (
                <Task key={r.id} r={r} done={isDone(r)} by={tickOf(r)?.userName} onTick={() => tick(r)} />
              ))}
            </ul>
          </div>
        ))
      )}
      {!groups.some((x) => STOCK_GROUPS.has(x.g)) && <p className="mt-3 text-[13px] text-success">Stock is fine.</p>}

      {upcoming.length > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2">
            <Heading>Coming up</Heading>
            {upcoming.some(isNoWork) && (
              <span className="flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-danger" /> No work
              </span>
            )}
          </div>
          <ComingUp upcoming={upcoming} />
        </div>
      )}

      <Link href="/calendar" className="mt-3 inline-block text-[13px] font-semibold text-cacao underline-offset-2 hover:underline">
        Open the calendar
      </Link>
    </section>
  );
}
