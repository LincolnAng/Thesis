"use client";

import { Answer, SectionTitle } from "@/components/inventory/section";
import { StatCard, StatCardGrid } from "@/components/inventory/stat-card";
import { formatNumber, listPhrase, pluralize } from "@/lib/format";
import type { ProductionPlan } from "@/lib/summary/production-schedule";

/**
 * How many jars to make, what that needs buying, and — the part that was missing — why.
 *
 * Both answers used to arrive as table cells among other table cells, so the two numbers
 * the page exists to produce were the hardest things on it to find. Each section opens with
 * the answer as a sentence now, and the working is a card per product rather than a row of
 * six aligned columns: each product is its own question, so it gets its own box.
 *
 * The arithmetic is still spelled out, because an event planned into a month that stock
 * already covered used to change nothing visible, which read exactly like the event having
 * been ignored. The shopping list comes from `plan.ingredientNeeds`, which the page computed
 * on every render and then never displayed.
 */

export function ToMakeTab({
  plan,
  utilization,
  hasCacao,
  onUtilizationChange,
}: {
  plan: ProductionPlan;
  utilization: number;
  hasCacao: boolean;
  onUtilizationChange: (pct: number) => void;
}) {
  const toMake = plan.needs.filter((n) => n.jarsToMake > 0);
  const shopping = plan.ingredientNeeds.filter((n) => n.required > 0);
  const short = shopping.filter((n) => n.short > 0);

  const makeSentence = `Make ${listPhrase(toMake.map((n) => `${pluralize(n.jarsToMake, "jar")} of ${n.productName}`))}.`;
  const buySentence = `Buy ${listPhrase(short.map((n) => `${formatNumber(n.short)} ${n.unit} more ${n.name.toLowerCase()}`))}.`;

  // Most urgent first, then the products with nothing to do — the same ordering idea as the
  // shelf, so a card in the top-left always means "this is the one that needs you".
  const needs = [...plan.needs].sort((a, b) => b.jarsToMake - a.jarsToMake);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-line/15 bg-white p-5">
        <SectionTitle>How much to make</SectionTitle>

        {toMake.length === 0 ? (
          <Answer tone="good">Nothing to make.</Answer>
        ) : (
          <Answer>{makeSentence}</Answer>
        )}

        {(plan.jarsLate > 0 || plan.jarsUnscheduled > 0) && plan.hasEquipment && (
          <p className="mt-2 text-[13px] font-semibold text-danger">
            {`${pluralize(plan.jarsLate + plan.jarsUnscheduled, "jar")} won't be ready in time.`}
          </p>
        )}
        {plan.jarsExpiring > 0 && (
          <p className="mt-1 text-[13px] font-semibold text-[#9A6B12]">
            {`${pluralize(plan.jarsExpiring, "jar")} would spoil before they're needed.`}
          </p>
        )}

        <div className="mt-4 border-t border-line/10 pt-3">
          {needs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products yet.</p>
          ) : (
            <StatCardGrid>
              {needs.map((n) => {
                const needed = n.forecastQty + n.eventQty;
                const work = n.missingMinutes ? "set how long a jar takes" : `${Math.round(n.minutesNeeded)} min of work`;
                return (
                  <StatCard
                    key={n.productId}
                    label={n.productName}
                    value={String(n.jarsToMake)}
                    unit="jars"
                    detail={`${needed} needed (${n.forecastQty} to sell${
                      n.eventQty > 0 ? ` + ${n.eventQty} for events` : ""
                    }), ${n.onHand} on the shelf — ${n.jarsToMake > 0 ? work : "nothing to make"}.`}
                  />
                );
              })}
            </StatCardGrid>
          )}
        </div>

      </section>

      <section className="rounded-2xl border border-line/15 bg-white p-5">
        <SectionTitle>How much to buy</SectionTitle>

        {shopping.length === 0 ? (
          <Answer tone="good">Nothing to buy.</Answer>
        ) : short.length === 0 ? (
          <Answer tone="good">Nothing to buy.</Answer>
        ) : (
          <Answer tone="bad">{buySentence}</Answer>
        )}

        {shopping.length > 0 && (
          <div className="mt-4 border-t border-line/10 pt-3">
            <StatCardGrid>
              {shopping.map((n) => (
                <StatCard
                  key={n.materialId}
                  label={n.name}
                  value={formatNumber(n.required)}
                  unit={n.unit}
                  flag={n.short > 0 ? `Short ${formatNumber(n.short)}` : undefined}
                  detail={`${formatNumber(n.required)} ${n.unit} needed, ${formatNumber(n.onHand)} ${n.unit} on hand${
                    n.short > 0 ? ` — ${formatNumber(n.short)} ${n.unit} short.` : " — enough."
                  }`}
                  tone={n.short > 0 ? "bad" : "muted"}
                />
              ))}
            </StatCardGrid>
          </div>
        )}

        {hasCacao && (
          <div
            className="mt-4 rounded-xl border border-line/15 bg-secondary/50 px-4 py-3"
            title={`How much of a raw bean survives roasting and winnowing. At ${utilization}%, 1 kg of raw beans gives ${formatNumber(
              Math.round(utilization * 10) / 1000,
            )} kg usable, so the beans above are the recipe amount divided by ${utilization}%.`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] font-semibold">Cacao utilization</span>
              <input
                type="range"
                min={30}
                max={100}
                value={utilization}
                onChange={(e) => onUtilizationChange(Number(e.target.value))}
                className="h-1 w-40 accent-cacao"
                aria-label="Cacao utilization rate"
              />
              <span className="font-display text-[17px] font-semibold">{utilization}%</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
