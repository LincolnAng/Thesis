"use client";

import Link from "next/link";
import { useStore } from "@/lib/store/use-store";
import { forecastAll } from "@/lib/summary/forecast";
import { eventPlan, salesTarget } from "@/lib/summary/business-config";
import { formatPeso, pluralize } from "@/lib/format";
import { Em, monthKey, monthKeyOf, monthName, type Tone } from "@/components/simple/simple-ui";

interface Card {
  tone: Tone;
  text: React.ReactNode;
  action: string;
  href: string;
}

const TONE_BORDER: Record<Tone, string> = {
  good: "border-l-success",
  warn: "border-l-[#C08552]",
  bad: "border-l-danger",
  neutral: "border-l-cacao",
};

/** Home in Simple mode: at most three sentences, each ending in what to do about it. */
export function SimpleToday() {
  const { entries, products, events, businessSettings } = useStore();
  const now = new Date();
  const thisMonth = monthKey(0, now);
  const lastMonth = monthKey(-1, now);
  const sum = (month: string, type: "SALE" | "EXPENSE") =>
    entries.filter((e) => e.type === type && monthKeyOf(e.timestamp) === month).reduce((s, e) => s + (e.amount ?? 0), 0);

  const sales = sum(thisMonth, "SALE");
  const kept = sales - sum(thisMonth, "EXPENSE");
  const lastKept = sum(lastMonth, "SALE") - sum(lastMonth, "EXPENSE");
  const hadLastMonth = entries.some((e) => monthKeyOf(e.timestamp) === lastMonth);
  const cards: Card[] = [];

  // 1. Money
  cards.push({
    tone: kept >= 0 ? "good" : "bad",
    text:
      kept >= 0 ? (
        <>
          This month you sold <Em>{formatPeso(sales)}</Em> and kept <Em tone="good">{formatPeso(kept)}</Em> after costs
          {hadLastMonth && <>{kept >= lastKept ? " — better than last month" : " — less than last month"}</>}.
        </>
      ) : (
        <>
          This month you&apos;ve spent <Em tone="bad">{formatPeso(-kept)}</Em> more than you made from sales so far.
        </>
      ),
    action: "See your money",
    href: "/transactions",
  });

  // 2. Stock: the single most urgent product.
  const forecasts = forecastAll(products, entries, now);
  const urgent = products
    .map((p) => ({ p, monthly: forecasts.find((f) => f.productId === p.id)?.forecastQty ?? 0 }))
    .filter(({ p, monthly }) => p.stockQty <= p.lowStockThreshold || p.stockQty < monthly)
    .sort((a, b) => a.p.stockQty / Math.max(1, a.monthly) - b.p.stockQty / Math.max(1, b.monthly))[0];
  if (urgent) {
    const batches = urgent.p.batchYield > 0 ? Math.max(1, Math.ceil((Math.max(urgent.monthly, urgent.p.lowStockThreshold) - urgent.p.stockQty) / urgent.p.batchYield)) : 1;
    cards.push({
      tone: "bad",
      text: (
        <>
          <Em tone="bad">{urgent.p.name}</Em> is running low — {pluralize(urgent.p.stockQty, "jar")} left
          {urgent.monthly > 0 ? `, and it usually sells about ${urgent.monthly} a month` : ""}. Make {pluralize(batches, "batch", "batches")} soon.
        </>
      ),
      action: "See your stock",
      href: "/inventory",
    });
  } else {
    cards.push({ tone: "good", text: <>Your stock looks fine — nothing is running low.</>, action: "See your stock", href: "/inventory" });
  }

  // 3. What's next: an upcoming event, or progress toward the sales goal.
  const today = now.toISOString().slice(0, 10);
  const next = events
    .filter((e) => e.status === "open" && e.startDate && e.startDate.slice(0, 10) > today)
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))[0];
  const goal = salesTarget(businessSettings);
  if (next?.startDate) {
    const days = Math.ceil((new Date(next.startDate).getTime() - now.getTime()) / 86400000);
    const bring = Object.values(eventPlan(businessSettings, next.id)).reduce((s, n) => s + n, 0);
    cards.push({
      tone: "neutral",
      text: (
        <>
          <Em>{next.name}</Em> is in {pluralize(days, "day")}
          {bring > 0 ? <> — bring {pluralize(bring, "jar")}</> : " — decide how many jars to bring"}.
        </>
      ),
      action: "See your events",
      href: "/people?tab=events",
    });
  } else if (goal > 0) {
    const pct = Math.round((sales / goal) * 100);
    cards.push({
      tone: pct >= 100 ? "good" : "neutral",
      text: (
        <>
          You&apos;re at <Em tone={pct >= 100 ? "good" : "neutral"}>{pct}%</Em> of your {formatPeso(goal)} sales goal for {monthName(thisMonth)}.
        </>
      ),
      action: "See your money",
      href: "/transactions",
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {cards.map((c, i) => (
        <div key={i} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-l-4 border-line/15 bg-white px-5 py-4 ${TONE_BORDER[c.tone]}`}>
          <p className="min-w-0 flex-1 text-[16px] leading-relaxed">{c.text}</p>
          <Link href={c.href} className="shrink-0 text-[13px] font-semibold text-cacao">
            {c.action} →
          </Link>
        </div>
      ))}
    </div>
  );
}
