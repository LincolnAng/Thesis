"use client";

import { PackagePlus, Plus } from "lucide-react";
import type { ProductionPlan } from "@/lib/summary/production-schedule";
import type { Product } from "@/lib/store/types";
import { pluralize } from "@/lib/format";
import { shelfOutlook, wasteShare } from "@/lib/summary/shelf-life";
import { PlanFixes } from "@/components/inventory/plan-fixes";
import type { PlanFix } from "@/lib/summary/plan-contingency";
import { AdvancedHint, BigButton, Em, Gauge, Headline, SectionTitle, SentenceList, SentenceRow, type Tone } from "@/components/simple/simple-ui";

const RANK: Record<Tone, number> = { bad: 0, warn: 1, neutral: 2, good: 3 };

/**
 * What the shelf line says. The old one divided stock by the sales rate and stopped there,
 * which produced "enough for about 104 weeks" for jars that keep for thirteen. Where the
 * surplus will expire first, that is the sentence worth reading.
 */
function shelfText(stockQty: number, weeks: number | null, jarsAtRisk: number, shelfLifeWeeks: number): string {
  const jars = pluralize(stockQty, "jar");
  if (jarsAtRisk >= 1) {
    const window = shelfLifeWeeks >= 1 ? pluralize(Math.round(shelfLifeWeeks), "week") : "a week";
    return weeks === null
      ? `${jars} — no sales yet, and they only keep about ${window}`
      : `${jars} — about ${jarsAtRisk} will pass their best-before, they only keep ${window}`;
  }
  if (weeks === null) return `${jars} — no sales yet to tell how long they'll last`;
  return `${jars} — enough for about ${weeks < 1 ? "less than a week" : pluralize(Math.round(weeks), "week")}`;
}

function dayName(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/** Stock in Simple mode: what to make soon, and how long each product's jars will last. */
export function SimpleStock({
  products,
  plan,
  onMade,
  onAddProduct,
  onEditProduct,
  shelfLifeOf,
  fixes,
}: {
  products: Product[];
  plan: ProductionPlan;
  onMade: () => void;
  onAddProduct: () => void;
  onEditProduct: (id: string) => void;
  /** Days each product keeps for, so the shelf can tell cover apart from surplus. */
  shelfLifeOf: (productId: string) => number;
  /** What to change when the plan can't be met. Simple mode needs this most — it has no
   *  calendar to go and read, so "no free day" is otherwise the end of the conversation. */
  fixes: PlanFix[];
}) {
  const monthlyOf = (id: string) => plan.forecasts.find((f) => f.productId === id)?.forecastQty ?? 0;
  const toMake = plan.needs.filter((n) => n.jarsToMake > 0);
  const firstDay = (id: string) => plan.days.find((d) => d.status === "open" && d.runs.some((r) => r.productId === id))?.date;

  const shelf = products
    .map((p) => {
      const monthly = monthlyOf(p.id);
      const outlook = shelfOutlook(p.stockQty, monthly, shelfLifeOf(p.id));
      const weeks = outlook.realWeeks;
      const belowWarning = p.stockQty <= p.lowStockThreshold;
      // Too much is a problem too, and it used to show as a comfortable green "Enough". If
      // most of a shelf will pass its best-before first, that is not cover — it is a loss that
      // has already happened and nobody has noticed.
      // Only claimed where there IS a sales rate to judge against. With no history every jar
      // counts as at-risk, which is true of the expiry date but says nothing about whether she
      // made too many — and "Too much" is a verdict, not a worry.
      const overstocked =
        outlook.limitedBy === "expiry" && wasteShare(outlook, p.stockQty) >= 0.5 && outlook.jarsAtRisk >= 2;
      // Without sales history, fall back to the owner's own warning level: at or below it is
      // low, within twice of it is getting there.
      const tone: Tone =
        belowWarning || (weeks !== null && weeks < 2)
          ? "bad"
          : overstocked || (weeks !== null && weeks < 4) || (weeks === null && p.stockQty <= p.lowStockThreshold * 2)
            ? "warn"
            : "good";
      const status = belowWarning || (weeks !== null && weeks < 2)
        ? "Running low"
        : overstocked
          ? "Too much"
          : tone === "warn"
            ? "Getting low"
            : "Enough";
      return { p, weeks, tone, status, outlook };
    })
    // Most urgent first: running low, then getting low, then enough; fewest weeks left within each.
    .sort((a, b) => RANK[a.tone] - RANK[b.tone] || (a.weeks ?? 99) - (b.weeks ?? 99) || a.p.stockQty - b.p.stockQty);
  const runningLow = shelf.filter((r) => r.tone === "bad");

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6">
      {fixes.length > 0 && <PlanFixes fixes={fixes} compact />}
      {toMake.length === 0 && runningLow.length > 0 ? (
        <Headline tone="bad" sub="It's at or below the level you asked to be warned at.">
          <Em tone="bad">{runningLow.map((r) => r.p.name).join(", ")}</Em> {runningLow.length === 1 ? "is" : "are"} running low.
        </Headline>
      ) : toMake.length === 0 ? (
        <Headline tone="good" sub="You have enough jars for what you usually sell next month.">
          Your shelves are well stocked.
        </Headline>
      ) : (
        <Headline tone="warn" sub="Based on what you usually sell each month, plus anything you're bringing to events.">
          You should make <Em tone="warn">{pluralize(toMake.length, "product")}</Em> soon.
        </Headline>
      )}

      {toMake.length > 0 && (
        <div>
          <SectionTitle>Make these soon</SectionTitle>
          <SentenceList>
            {toMake.map((n) => {
              const day = firstDay(n.productId);
              return (
                <SentenceRow
                  key={n.productId}
                  sub={
                    n.missingYield
                      ? "Tell me how many jars one batch makes (tap the product below) to plan batches."
                      : day
                        ? `A good day to make it: ${dayName(day)}`
                        : "No free day found before the end of next month."
                  }
                  right={
                    <button type="button" onClick={onMade} className="rounded-lg bg-cacao px-3.5 py-2 text-[13px] font-semibold text-ivory">
                      I made it
                    </button>
                  }
                >
                  Make{" "}
                  <strong>
                    {n.missingYield
                      ? `about ${pluralize(n.jarsToMake, "jar")}`
                      : `${pluralize(n.batchesNeeded, "batch", "batches")} (about ${pluralize(n.jarsToMake, "jar")})`}
                  </strong>{" "}
                  of {n.productName}
                </SentenceRow>
              );
            })}
          </SentenceList>
        </div>
      )}

      <div>
        <SectionTitle>On your shelf</SectionTitle>
        <div className="flex flex-col gap-5 rounded-2xl border border-line/15 bg-white p-5">
          {shelf.map(({ p, weeks, tone, status, outlook }) => (
            <button key={p.id} type="button" onClick={() => onEditProduct(p.id)} className="text-left" title="Tap to change this product">
              <Gauge
                label={p.name}
                tone={tone}
                status={status}
                pct={weeks !== null ? (weeks / 8) * 100 : (p.stockQty / Math.max(p.stockQty, p.lowStockThreshold * 3, 1)) * 100}
                text={shelfText(p.stockQty, weeks, outlook.jarsAtRisk, outlook.shelfLifeWeeks)}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 min-[640px]:flex-row">
        <BigButton icon={PackagePlus} label="I made a batch" hint="Add the jars to your shelf" onClick={onMade} />
        <BigButton icon={Plus} label="Add a new product" hint="Something new you sell" onClick={onAddProduct} />
      </div>

      <AdvancedHint what="the production calendar, schedules, or raw materials" />
    </div>
  );
}
