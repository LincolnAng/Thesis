"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Filter, Sparkles } from "lucide-react";
import { AGGREGATE_ID, aggregateForecast, type ProductForecast } from "@/lib/summary/forecast";
import { seasonStrength } from "@/lib/summary/seasonality";
import { ConfidenceDonut } from "@/components/inventory/confidence-donut";
import { EMPTY, seasonColor } from "@/lib/summary/scale-colors";
import { useStore } from "@/lib/store/use-store";
import { CarouselNav } from "@/components/ui/carousel-nav";
import { Segmented } from "@/components/ui/kit";
import { fullName } from "@/lib/summary/product-sizes";
import { productPattern, seasonNotes, shelfLifeDays } from "@/lib/summary/business-config";
import { workOutPattern } from "@/lib/summary/work-out-pattern";

/**
 * The twelve months behind the forecast, month by month.
 *
 * The forecast is a single number on every other screen — "November needs 13 jars" — and a
 * single number is impossible to argue with or learn from. This shows what produced it: how
 * strong each month's season is, and the jars that fall out of it.
 *
 * Two things this screen deliberately does NOT do. It does not ask the owner to go and set a
 * seasonal pattern in Settings: "when does this sell?" is the question she is asking the app,
 * so the app works it out and tells her, in words, the first time she looks. And it does not
 * show her a multiplier. "1.27x" is arithmetic she has to finish herself; WEAK, NORMAL and
 * STRONG on a fixed ten-point ladder say it outright, and mean the same across every product.
 */

/**
 * Products already attempted this session. Working out a pattern can cost an API call, so a
 * remount, a tab switch or a re-render must not spend it again — including after a failure,
 * where retrying on every render would be the expensive kind of bug.
 */
const attempted = new Set<string>();

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <span className="relative block h-4 rounded bg-track">
      <span className="absolute inset-y-0 left-0 rounded bg-cacao/70" style={{ width: `${pct}%` }} />
    </span>
  );
}

// The jars figure sits at the end of its own bar rather than in a column of its own: a bar and
// the number it stands for are one fact, and putting them at opposite ends of a wide row makes
// the eye travel to join them back up.
const COLS = "grid grid-cols-[52px_minmax(0,1fr)_56px_170px_90px] items-center gap-3";

/**
 * One month, split by product.
 *
 * The combined row answers "how many jars altogether in December?" and hides which product
 * is driving it — a strong December for one line and a flat one for another average into a
 * number that describes neither. This is the same arithmetic read one product at a time: the
 * aggregate was built by summing exactly these, so the parts always add up to the total above
 * them.
 */
function MonthByProduct({
  forecasts,
  monthIdx,
  label,
  nameOf,
}: {
  forecasts: ProductForecast[];
  monthIdx: number;
  label: string;
  nameOf: (f: ProductForecast) => string;
}) {
  const rows = forecasts
    .map((f) => ({ forecast: f, month: f.monthly[monthIdx] as ProductForecast["monthly"][number] | undefined }))
    .sort((a, b) => (b.month?.units ?? -1) - (a.month?.units ?? -1));

  if (rows.length === 0) {
    return <div className="px-3 py-2 text-[12px] text-muted-foreground">No products to break down.</div>;
  }

  const total = rows.reduce((sum, r) => sum + (r.month ? Math.round(r.month.units) : 0), 0);

  return (
    <div className="border-t border-line/10 bg-secondary/30 px-3 py-2">
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {`${label} — by product`}
      </div>
      {rows.map(({ forecast, month }) => {
        if (!month) {
          return (
            <div
              key={forecast.productId}
              className="grid grid-cols-[minmax(0,1fr)_56px_170px_90px] items-center gap-3 py-1 text-[12px]"
            >
              <span className="truncate pl-4 text-muted-foreground">{nameOf(forecast)}</span>
              <span className="text-right text-muted-foreground">—</span>
              <span className="text-[11px] text-muted-foreground">no sales yet to forecast from</span>
              <span />
            </div>
          );
        }
        const { score, word } = seasonStrength(month.seasonIndex);
        const colour = seasonColor(score);
        return (
          <div
            key={forecast.productId}
            className="grid grid-cols-[minmax(0,1fr)_56px_170px_90px] items-center gap-3 py-1 text-[12px]"
          >
            <span className="truncate pl-4">{nameOf(forecast)}</span>
            <span className="text-right font-semibold tabular-nums">{Math.round(month.units)}</span>
            <span className="flex items-center gap-2" title={`${month.seasonIndex.toFixed(2)}x an ordinary month`}>
              <span
                className="w-[116px] shrink-0 whitespace-nowrap rounded-md px-1.5 py-[2px] text-center text-[9px] font-bold tracking-wide text-white"
                style={{ background: colour }}
              >
                {word}
              </span>
              <span className="flex items-center gap-[2px]" aria-hidden>
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <span
                    key={i}
                    className="h-2 w-[3px] rounded-[1px]"
                    style={{ background: i <= score ? colour : EMPTY }}
                  />
                ))}
              </span>
            </span>
            <span className="flex justify-center">
              <ConfidenceDonut
                reliability={forecast.reliability}
                size={15}
                override={{
                  bars: month.bars,
                  range: month.range,
                  note:
                    month.observed === 0
                      ? `No ${label.replace(/\s+\d+$/, "")} on record for ${nameOf(forecast)} yet.`
                      : `${month.observed} ${month.observed === 1 ? "year" : "years"} of this month logged for ${nameOf(forecast)}.`,
                }}
              />
            </span>
          </div>
        );
      })}
      <div className="mt-1 border-t border-line/10 pt-1 pl-4 text-[11px] text-muted-foreground">
        {`Adds up to ${total} — the figure above.`}
      </div>
    </div>
  );
}

/**
 * Which products the table covers.
 *
 * A chip per product spread across the header and pushed the heading around as products were
 * added; with six or eight of them it would have been a wall. One button that says what is
 * currently showing, opening a list of checks, stays the same size whatever the shop sells.
 */
function ProductFilter({
  all,
  excluded,
  onChange,
  nameOf,
}: {
  all: ProductForecast[];
  excluded: Set<string>;
  onChange: (next: Set<string>) => void;
  nameOf: (f: ProductForecast) => string;
}) {
  const [open, setOpen] = useState(false);
  const included = all.filter((f) => !excluded.has(f.productId));
  const label =
    excluded.size === 0
      ? "All products"
      : included.length === 1
        ? nameOf(included[0])
        : `${included.length} of ${all.length} products`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm"
      >
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="max-w-[16rem] truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          {/* Clicking anywhere else closes it, which is what a menu is expected to do. */}
          <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-[17rem] rounded-xl border border-line/15 bg-card p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold hover:bg-secondary"
            >
              All products
              {excluded.size === 0 && <Check className="h-3.5 w-3.5 text-cacao" />}
            </button>
            <div className="my-1 border-t border-line/10" />
            {all.map((f) => {
              const on = !excluded.has(f.productId);
              return (
                <div key={f.productId} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      const others = all.map((x) => x.productId).filter((id) => id !== f.productId);
                      // Never leave the table empty: unticking the last one keeps it on.
                      if (on && included.length === 1) return;
                      const next = new Set(excluded);
                      if (on) next.add(f.productId);
                      else next.delete(f.productId);
                      onChange(next.size === all.length ? new Set(others) : next);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-secondary"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        on ? "border-cacao bg-cacao text-ivory" : "border-line/30"
                      }`}
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{nameOf(f)}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** One month: how many to expect altogether, how strong its season is, and the split by product. */
function MonthSummary({
  months,
  at,
  onStep,
  chosen,
  shown,
  nameOf,
}: {
  months: { m: ProductForecast["monthly"][number]; i: number }[];
  at: number;
  onStep: (n: number) => void;
  chosen: ProductForecast;
  shown: ProductForecast[];
  nameOf: (f: ProductForecast) => string;
}) {
  if (months.length === 0) return null;
  const index = Math.min(at, months.length - 1);
  const { m, i } = months[index];
  const { score, word } = seasonStrength(m.seasonIndex);
  const colour = seasonColor(score);
  return (
    <div className="rounded-xl border border-line/15">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
        <CarouselNav
          label={m.label}
          onPrev={() => onStep(Math.max(0, index - 1))}
          onNext={() => onStep(Math.min(months.length - 1, index + 1))}
          atStart={index === 0}
          atEnd={index === months.length - 1}
          position={{ index, count: months.length }}
          prevLabel="Earlier month"
          nextLabel="Later month"
        />
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-muted-foreground">
            <b className="font-display text-[22px] text-foreground tabular-nums">{Math.round(m.units)}</b> expected
          </span>
          <span
            className="whitespace-nowrap rounded-md px-2 py-[3px] text-[10px] font-bold tracking-wide text-white"
            style={{ background: colour }}
            title={`${m.seasonIndex.toFixed(2)}x an ordinary month`}
          >
            {word}
          </span>
          <ConfidenceDonut
            reliability={chosen.reliability}
            override={{
              bars: m.bars,
              range: m.range,
              note:
                m.observed === 0
                  ? `You have never logged a ${m.label.replace(/\s+\d+$/, "")} yet, so this month leans on the pattern rather than your own figures.`
                  : `You have ${m.observed} ${m.observed === 1 ? "year" : "years"} of this calendar month logged.`,
            }}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[440px]">
          <MonthByProduct forecasts={shown} monthIdx={i} label={m.label} nameOf={nameOf} />
        </div>
      </div>
    </div>
  );
}

export function SeasonalBreakdown({
  forecasts,
  embedded = false,
  skipMonth,
}: {
  forecasts: ProductForecast[];
  /** Drawn as part of the card it sits in (Production's demand card) rather than a card of its own. */
  embedded?: boolean;
  /** A month already shown elsewhere ("2026-11"), left out of the list. */
  skipMonth?: string;
}) {
  const { businessSettings, products, entries } = useStore();
  // Every product is listed, including ones with no sales yet. Leaving them out made the
  // filter quietly disagree with the Products page about how many products exist, and "this
  // one has no forecast" is itself worth seeing.
  const forecastable = forecasts;
  // Names come from the product list as it is now, sizes included ("Classic · 250 g"), so a
  // rename or a new size shows here at once instead of the name the forecast was built with.
  const nameOf = (f: ProductForecast) => {
    const p = products.find((x) => x.id === f.productId);
    return p ? fullName(p, products) : f.productName;
  };

  /**
   * Which products the table is about.
   *
   * It used to be a dropdown of one: all products, or a single one. That answered "how many
   * jars of Classic in December?" and "how many altogether?" and nothing in between — and the
   * in-between is the comparison she actually wants, the same two lines read down twelve
   * months beside each other. Everything below works off this set: the table sums it, and
   * opening a month breaks it apart again.
   */
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const included = forecastable.filter((f) => !excluded.has(f.productId));
  const shown = included.length > 0 ? included : forecastable;
  // The table itself can only be drawn from products that HAVE a forecast; the rest still
  // appear in the filter and in a month's breakdown, where "nothing yet" is a real answer.
  const usable = shown.filter((f) => f.monthly.length > 0);

  // With one product chosen there is nothing to combine, and a one-item total would strip its
  // own name off the heading — so that product's forecast IS the table.
  const combined = aggregateForecast(usable);
  const chosen = combined ?? usable[0];
  const withMonths = usable;

  const [learning, setLearning] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  // One month at a time by default — twelve rows at once was a lot to take in — with every
  // month in one table a tap away.
  const [view, setView] = useState<"month" | "all">("month");
  const [monthAt, setMonthAt] = useState(0);
  const running = useRef(false);

  const chosenId = chosen?.productId ?? "";
  const stored = chosenId && chosenId !== AGGREGATE_ID ? productPattern(businessSettings, chosenId) : null;
  // A pattern carried over from the old dropdown is not an answer, it is a leftover. Treat it
  // as nothing so the app works out a real one.
  const pattern = stored && stored.source !== "legacy" ? stored : null;

  // Work out the pattern the moment she looks at a product that has none, rather than telling
  // her to go and set one. Measuring from her own sales costs nothing; only when there isn't
  // enough history does this reach the assistant.
  useEffect(() => {
    // The combined row is not a product and has no pattern of its own to work out.
    if (!chosenId || chosenId === AGGREGATE_ID || pattern || attempted.has(chosenId) || running.current) return;
    const product = products.find((p) => p.id === chosenId);
    if (!product) return;

    attempted.add(chosenId);
    running.current = true;
    // Deferred so the spinner is not set during the effect body itself, which would cascade a
    // second render before the first has committed.
    queueMicrotask(() => {
      setLearning(chosenId);
      setFailed(null);
    });

    void workOutPattern(
      product,
      entries,
      products,
      shelfLifeDays(businessSettings, chosenId),
      seasonNotes(businessSettings),
    )
      .then((result) => {
        if (result.error) setFailed(result.error);
      })
      .finally(() => {
        running.current = false;
        setLearning(null);
      });
  }, [chosenId, pattern, products, entries, businessSettings]);

  // No sales yet: show the chart's frame — the coming twelve months with empty bars — so it's
  // clear what will appear here, rather than a blank card with a sentence in it.
  if (withMonths.length === 0) {
    const now = new Date();
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const months = Array.from({ length: 13 }, (_, i) => new Date(now.getFullYear(), now.getMonth() + 1 + i, 1))
      .filter((d) => key(d) !== skipMonth)
      .slice(0, 12)
      .map((d) => `${d.toLocaleDateString("en-US", { month: "short" })} '${String(d.getFullYear()).slice(2)}`);
    return (
      <section className={embedded ? "" : "rounded-2xl border border-line/15 bg-card p-5"}>
        <h2 className={embedded ? "text-[14.5px] font-semibold" : "font-display text-[17px] font-semibold"}>What to expect each month</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Nothing to show yet — once a full month of sales is logged, each month below fills in with how many jars to expect and how strong its season is.
        </p>
        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[520px]" aria-hidden>
            <div className={`${COLS} border-b border-line/10 pb-2 text-[10px] font-bold uppercase leading-tight tracking-wide text-muted-foreground`}>
              <span>Month</span>
              <span>Expected demand</span>
              <span className="text-right">Count</span>
              <span className="w-[116px] text-center">Season</span>
              <span className="text-center">Confidence Level</span>
            </div>
            {months.map((label) => (
              <div key={label} className={`${COLS} border-b border-line/10 py-1.5 text-[13px] last:border-0`}>
                <span className="whitespace-nowrap text-muted-foreground">{label}</span>
                <span className="block h-4 rounded bg-track" />
                <span className="text-right text-muted-foreground/60">—</span>
                <span className="flex items-center gap-2">
                  <span className="w-[116px] shrink-0 rounded-md bg-track py-[3px] text-center text-[10px] font-bold tracking-wide text-muted-foreground/60">—</span>
                  <span className="flex items-center gap-[2px]">
                    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <span key={i} className="h-2.5 w-[3px] rounded-[1px]" style={{ background: EMPTY }} />
                    ))}
                  </span>
                </span>
                <span className="flex justify-center">
                  <span className="h-5 w-5 rounded-full border-[3px] border-track" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Scale on the ROUNDED jars, the same figure the labels show. Scaling on the raw units drew
  // three different bar lengths for three months that all read "1 jar" — the bar and the number
  // beside it are one fact, and a reader who sees them disagree is right to distrust both.
  const max = Math.max(...chosen.monthly.filter((m) => m.month !== skipMonth).map((m) => Math.round(m.units)), 1);

  return (
    <section className={embedded ? "" : "rounded-2xl border border-line/15 bg-card p-5"}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className={embedded ? "text-[14.5px] font-semibold" : "font-display text-[17px] font-semibold"}>What to expect each month</h2>
            <ConfidenceDonut reliability={chosen.reliability} showLabel />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{chosen.reliability.reason}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Show one month or all"
            value={view}
            onChange={setView}
            options={[
              { value: "month", label: "By month" },
              { value: "all", label: "All months" },
            ]}
          />
          {forecastable.length > 1 && <ProductFilter all={forecastable} excluded={excluded} onChange={setExcluded} nameOf={nameOf} />}
        </div>
      </div>

      {/* What the app worked out about this product's year, in her words, not a settings link. */}
      {learning === chosen.productId ? (
        <p className="mb-3 flex items-center gap-2 rounded-xl border border-cacao/25 bg-cacao/[0.04] px-4 py-2.5 text-[12px]">
          <Sparkles className="h-3.5 w-3.5 animate-pulse text-cacao" />
          {`Working out when ${nameOf(chosen)} sells best…`}
        </p>
      ) : pattern ? (
        <p className="mb-3 rounded-xl border border-cacao/25 bg-cacao/[0.04] px-4 py-2.5 text-[12px] leading-relaxed">
          <span className="font-semibold">
            {pattern.source === "measured"
              ? "From your own sales: "
              : pattern.source === "manual"
                ? "You set this: "
                : "BAi worked this out: "}
          </span>
          {pattern.reason}
        </p>
      ) : failed ? (
        <p className="mb-3 rounded-xl bg-danger/[0.06] px-4 py-2.5 text-[12px] text-danger">{failed}</p>
      ) : null}

      {view === "month" ? (
        <MonthSummary
          months={chosen.monthly.map((m, i) => ({ m, i })).filter(({ m }) => m.month !== skipMonth)}
          at={monthAt}
          onStep={setMonthAt}
          chosen={chosen}
          shown={shown}
          nameOf={nameOf}
        />
      ) : (
      <div className="overflow-x-auto">
      <div className="min-w-[560px]">
      <div
        className={`${COLS} border-b border-line/10 pb-2 text-[10px] font-bold uppercase leading-tight tracking-wide text-muted-foreground`}
      >
        <span>Month</span>
        <span>Expected demand</span>
        <span className="text-right">Count</span>
        {/* Sat over the whole column, "Season" floated left of the thing it names. Boxed to the
            badge's own width so the heading sits centred on the badges below it. */}
        <span className="w-[116px] text-center">Season</span>
        <span className="text-center">Confidence Level</span>
      </div>

      {chosen.monthly.map((m, monthIdx) => {
        if (m.month === skipMonth) return null;
        const { score, word } = seasonStrength(m.seasonIndex);
        const colour = seasonColor(score);
        const jars = Math.round(m.units);
        const open = openMonth === m.month;
        return (
          <div key={m.month} className="border-b border-line/10 last:border-0">
            <button
              type="button"
              onClick={() => setOpenMonth(open ? null : m.month)}
              title={`${m.label} — tap for the breakdown by product`}
              className={`${COLS} w-full py-1.5 text-left text-[13px] transition hover:bg-secondary/50 ${open ? "bg-secondary/40" : ""}`}
            >
              <span className="flex items-center gap-1 text-muted-foreground">
                <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
                {m.label}
              </span>

              <span className="min-w-0">
                <Bar value={jars} max={max} />
              </span>

              <span className="text-right font-semibold tabular-nums">{jars}</span>

              {/* The label is a filled block rather than coloured text: at 10px, SLIGHTLY LEAN in
                  pale red was legible but not actually readable, and the colour is the point. A
                  fixed width keeps the dashes beside it in a straight column down the table. */}
              <span className="flex items-center gap-2" title={`${m.seasonIndex.toFixed(2)}x an ordinary month`}>
                <span
                  className="w-[116px] shrink-0 whitespace-nowrap rounded-md px-1.5 py-[3px] text-center text-[10px] font-bold tracking-wide text-white"
                  style={{ background: colour }}
                >
                  {word}
                </span>
                <span className="flex items-center gap-[2px]" aria-hidden>
                  {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <span
                      key={i}
                      className="h-2.5 w-[3px] rounded-[1px]"
                      style={{ background: i <= score ? colour : EMPTY }}
                    />
                  ))}
                </span>
              </span>

              <span className="flex justify-center">
                <ConfidenceDonut
                  reliability={chosen.reliability}
                  override={{
                    bars: m.bars,
                    range: m.range,
                    note:
                      m.observed === 0
                        ? `You have never logged a ${m.label.replace(/\s+\d+$/, "")} for this product yet, so this month leans on the pattern rather than your own figures.`
                        : `You have ${m.observed} ${m.observed === 1 ? "year" : "years"} of this calendar month logged.`,
                  }}
                />
              </span>
            </button>

            {open && <MonthByProduct forecasts={shown} monthIdx={monthIdx} label={m.label} nameOf={nameOf} />}
          </div>
        );
      })}
      </div>
      </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold">Season</span> runs from VERY LEAN to VERY STRONG — red means you sell less than
        usual that month, green means more, and NORMAL is an ordinary month.{" "}
        <span className="font-semibold">Sure?</span> is how much to trust the figure: it drops for months further ahead,
        and for months you have never traded through.
      </p>
    </section>
  );
}
