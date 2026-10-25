"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronRight, ListChecks, PackageX } from "lucide-react";
import { useReminders } from "@/lib/reminders/use-reminders";
import { isStockAlert, type Reminder } from "@/lib/reminders/reminders";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { useStore } from "@/lib/store/use-store";
import { formatPeso } from "@/lib/format";
import { dayKey } from "@/lib/home/today";

/**
 * Today at a glance, on Home: a plain task list — what to do today, in a few words each, with a
 * box to tick — then stock alerts, then what's coming up. Built from lib/reminders, which reads
 * the Calendar, so a task disappears on its own once it's dealt with (paid, restocked, the day
 * passes).
 *
 * Ticking a box only crosses it off on this device, for today; it doesn't record anything.
 * Paying, collecting or restocking is still done on its own tab, which the arrow opens.
 */

const TICKED_KEY = "mangkiko.home.ticked";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Crossed-off tasks for today, kept on this device only. */
function useTicked(): [Set<string>, (id: string) => void] {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(TICKED_KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading this device's storage after mount
      if (raw && raw.day === todayKey() && Array.isArray(raw.ids)) setTicked(new Set(raw.ids));
    } catch {
      // storage unavailable — start with nothing ticked
    }
  }, []);
  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(TICKED_KEY, JSON.stringify({ day: todayKey(), ids: [...next] }));
      } catch {
        // fine — it just won't be remembered
      }
      return next;
    });
  return [ticked, toggle];
}

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
};

function Task({ r, done, onTick }: { r: Reminder; done: boolean; onTick: () => void }) {
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
  const [ticked, toggle] = useTicked();
  const { entries } = useStore();
  const exec = isExecutive(useCurrentUser());

  // Not-done first; ticked ones sink to the bottom of their list.
  const order = (list: Reminder[]) => [...list].sort((a, b) => Number(ticked.has(a.id)) - Number(ticked.has(b.id)));
  const todo = order(today.filter((r) => !isStockAlert(r)));
  const stock = order(today.filter(isStockAlert));
  const left = todo.filter((r) => !ticked.has(r.id)).length;

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
        <span className="text-[13px] font-semibold text-muted-foreground">{todo.length === 0 ? "" : left === 0 ? "All done" : `${left} to do`}</span>
      </div>
      {exec && <p className="mb-2 text-[13px] text-muted-foreground">Sold {formatPeso(salesToday)} today</p>}

      <Heading>To do</Heading>
      {todo.length === 0 ? (
        <p className="rounded-xl bg-success/10 px-3 py-2.5 text-[14px] font-medium text-success">Nothing to do today.</p>
      ) : (
        <ul>
          {todo.map((r) => (
            <Task key={r.id} r={r} done={ticked.has(r.id)} onTick={() => toggle(r.id)} />
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Heading icon={<PackageX className="h-3.5 w-3.5" />}>Stock alerts</Heading>
        {stock.length === 0 ? (
          <p className="py-1 text-[14px] text-success">Stock is fine.</p>
        ) : (
          <ul>
            {stock.map((r) => (
              <Task key={r.id} r={r} done={ticked.has(r.id)} onTick={() => toggle(r.id)} />
            ))}
          </ul>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="mt-4">
          <Heading>Coming up</Heading>
          <ul className="flex flex-col">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 border-b border-line/10 py-1.5 text-[14px] last:border-0">
                <span className="min-w-0">{r.title}</span>
                <span className="shrink-0 text-[12.5px] text-muted-foreground">{dayLabel(r.date)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href="/calendar" className="mt-3 inline-block text-[13px] font-semibold text-cacao underline-offset-2 hover:underline">
        See the calendar
      </Link>
    </section>
  );
}
