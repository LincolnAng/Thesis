"use client";

import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
import { useStore } from "@/lib/store/use-store";
import { useProductionPlan } from "@/lib/summary/use-production-plan";
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
  // The same plan Inventory shows. See use-production-plan for why this is not worked out here.
  const plan = useProductionPlan();
  const now = new Date();
  const exec = isExecutive(useCurrentUser());
  const thisMonth = monthKey(0, now);
  const lastMonth = monthKey(-1, now);
  const sum = (month: string, type: "SALE" | "EXPENSE") =>
    entries.filter((e) => e.type === type && monthKeyOf(e.timestamp) === month).reduce((s, e) => s + (e.amount ?? 0), 0);

  const sales = sum(thisMonth, "SALE");
  const kept = sales - sum(thisMonth, "EXPENSE");
  const lastKept = sum(lastMonth, "SALE") - sum(lastMonth, "EXPENSE");
  const hadLastMonth = entries.some((e) => monthKeyOf(e.timestamp) === lastMonth);
  const cards: Card[] = [];

  // 1. Money. An employee sees what was sold, never what was kept: their copy of the data has
  // no expenses in it, so "kept" would just be sales again, presented as profit.
  if (!exec) {
    cards.push({
      tone: "good",
      text: (
        <>
          This month the shop has sold <Em>{formatPeso(sales)}</Em> so far.
        </>
      ),
      action: "See sales",
      href: "/transactions",
    });
  } else cards.push({
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

  // 2. Stock: whatever the production plan says is most urgent, worded as one sentence.
  const urgent = [...plan.needs]
    .filter((n) => n.jarsToMake > 0)
    .sort((a, b) => b.batchesNeeded - a.batchesNeeded || b.jarsToMake - a.jarsToMake)[0];
  // Low on the shelf but NOT needing production is a real state, and the old card could not
  // express it: it read the warning level and told her to make a batch she did not need.
  const lowButCovered = products.find((p) => p.stockQty <= p.lowStockThreshold);

  if (urgent) {
    const product = products.find((p) => p.id === urgent.productId);
    cards.push({
      tone: "bad",
      text: (
        <>
          <Em tone="bad">{urgent.productName}</Em> needs making — {pluralize(product?.stockQty ?? 0, "jar")} left and you
          need {pluralize(urgent.jarsToMake, "jar")} more. Make{" "}
          {urgent.missingYield ? "a batch" : pluralize(urgent.batchesNeeded, "batch", "batches")} soon.
        </>
      ),
      action: "See your stock",
      href: "/production",
    });
  } else if (lowButCovered) {
    cards.push({
      tone: "warn",
      text: (
        <>
          <Em tone="warn">{lowButCovered.name}</Em> is down to {pluralize(lowButCovered.stockQty, "jar")}, but that
          still covers what you expect to sell — nothing to make yet.
        </>
      ),
      action: "See your stock",
      href: "/production",
    });
  } else {
    cards.push({ tone: "good", text: <>Your stock looks fine — nothing is running low.</>, action: "See your stock", href: "/production" });
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
        <div key={i} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-l-4 border-line/15 bg-card px-5 py-4 ${TONE_BORDER[c.tone]}`}>
          <p className="min-w-0 flex-1 text-[16px] leading-relaxed">{c.text}</p>
          <Link href={c.href} className="shrink-0 text-[13px] font-semibold text-cacao">
            {c.action} →
          </Link>
        </div>
      ))}
    </div>
  );
}
