"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, CalendarDays, ChevronRight, CircleAlert, HandCoins, Info, PackageX } from "lucide-react";
import { useReminders } from "@/lib/reminders/use-reminders";
import type { Reminder } from "@/lib/reminders/reminders";

/**
 * What's up today, in two sizes: a bell in every page's title bar, with a count of what needs
 * doing, and a big card at the top of Home. Both read lib/reminders, which reads the Calendar,
 * so a reminder disappears on its own once it's dealt with (paid, restocked, the day passes).
 */

const TONE_STYLE: Record<Reminder["tone"], string> = {
  bad: "border-l-danger bg-danger/5",
  warn: "border-l-[var(--status-warning)] bg-[var(--status-warning)]/5",
  info: "border-l-line/30 bg-card",
};

function iconFor(r: Reminder) {
  const cls = `h-4 w-4 shrink-0 ${r.tone === "bad" ? "text-danger" : r.tone === "warn" ? "text-[var(--status-warning)]" : "text-muted-foreground"}`;
  if (r.category === "payments" || r.category === "followup") return <HandCoins className={cls} />;
  if (r.category === "alerts") return r.tone === "bad" ? <CircleAlert className={cls} /> : <PackageX className={cls} />;
  if (r.category === "events" || r.category === "dayoffs") return <CalendarDays className={cls} />;
  return <Info className={cls} />;
}

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
};

function Row({ r, showDate, onGo }: { r: Reminder; showDate?: boolean; onGo?: () => void }) {
  const body = (
    <>
      {iconFor(r)}
      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] font-semibold leading-snug ${r.tone === "bad" ? "text-danger" : "text-foreground"}`}>{r.title}</span>
        {(r.detail || showDate) && (
          <span className="block text-[12.5px] text-muted-foreground">{[showDate ? dayLabel(r.date) : null, r.detail].filter(Boolean).join(" · ")}</span>
        )}
      </span>
      {r.href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </>
  );
  const cls = `flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-line/10 border-l-4 px-3 py-2 text-left ${TONE_STYLE[r.tone]}`;
  return r.href ? (
    <Link href={r.href} onClick={onGo} className={`${cls} transition hover:brightness-95`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Lists({ today, upcoming, onGo, max }: { today: Reminder[]; upcoming: Reminder[]; onGo?: () => void; max?: number }) {
  const shownToday = max ? today.slice(0, max) : today;
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Today</h3>
        {today.length === 0 ? (
          <p className="rounded-xl bg-success/10 px-3 py-2.5 text-[14px] font-medium text-success">Nothing needs doing today.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shownToday.map((r) => (
              <li key={r.id}>
                <Row r={r} onGo={onGo} />
              </li>
            ))}
            {max && today.length > max && (
              <li className="px-1 text-[13px] text-muted-foreground">and {today.length - max} more — tap the bell to see them all</li>
            )}
          </ul>
        )}
      </section>
      {upcoming.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Coming up</h3>
          <ul className="flex flex-col gap-1.5">
            {upcoming.map((r) => (
              <li key={r.id}>
                <Row r={r} showDate onGo={onGo} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The bell in every page's title bar. */
export function ReminderBell() {
  const { today, upcoming, urgentCount } = useReminders();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={urgentCount ? `Reminders: ${urgentCount} need attention` : "Reminders"}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border transition ${
          open ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card text-foreground hover:bg-secondary"
        }`}
      >
        <Bell className="h-5 w-5" strokeWidth={1.9} />
        {urgentCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
            {urgentCount > 9 ? "9+" : urgentCount}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-[84px] z-50 max-h-[75svh] overflow-y-auto rounded-2xl border border-line/15 bg-ivory p-4 shadow-xl min-[640px]:absolute min-[640px]:inset-x-auto min-[640px]:right-0 min-[640px]:top-12 min-[640px]:w-[400px]">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-display text-[18px] font-semibold">What&apos;s up today</p>
            <Link href="/calendar" onClick={() => setOpen(false)} className="text-[13px] font-semibold text-cacao underline-offset-2 hover:underline">
              Open Calendar
            </Link>
          </div>
          <Lists today={today} upcoming={upcoming} onGo={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** The big version, at the top of Home. */
export function TodayReminders() {
  const { today, upcoming, urgentCount } = useReminders();
  return (
    <section
      aria-labelledby="whats-up"
      className="rounded-2xl border border-line/15 bg-card p-4 min-[640px]:p-5 min-[1280px]:max-h-[calc(100svh-120px)] min-[1280px]:overflow-y-auto"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="whats-up" className="flex items-center gap-2 font-display text-[22px] font-semibold">
          <Bell className="h-5 w-5 text-cacao" strokeWidth={2} />
          What&apos;s up today
          {urgentCount > 0 && <span className="rounded-full bg-danger px-2 py-0.5 text-[12px] font-bold text-white">{urgentCount} to do</span>}
        </h2>
        <Link href="/calendar" className="text-[13px] font-semibold text-cacao underline-offset-2 hover:underline">
          See the calendar
        </Link>
      </div>
      <Lists today={today} upcoming={upcoming} max={8} />
    </section>
  );
}
