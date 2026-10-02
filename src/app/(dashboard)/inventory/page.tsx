"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Page, PageTabs } from "@/components/layout/page";
import { SimpleStock } from "@/components/simple/simple-stock";
import { useViewMode } from "@/lib/summary/view-mode";
import { EventPlanDialog } from "@/components/inventory/event-plan-dialog";
import { PlanSettingsDialog } from "@/components/inventory/plan-settings-dialog";
import { ShelfTab } from "@/components/inventory/shelf-tab";
import { ToMakeTab } from "@/components/inventory/to-make-tab";
import { AddStockDialog } from "@/components/stock/add-stock-dialog";
import { AddProductDialog, EditProductDialog } from "@/components/stock/edit-product-dialog";
import { useStore } from "@/lib/store/use-store";
import { chipColor } from "@/lib/chart-colors";
import { formatNumber, listPhrase, pluralize } from "@/lib/format";
import { buildNextMonthDemand } from "@/lib/summary/next-month-demand";
import { isRawCacao } from "@/lib/summary/cacao";
import {
  buildProductionPlan,
  STRATEGY_HINTS,
  STRATEGY_LABELS,
  toIsoDate,
  type PlanDay,
  type ScheduleStrategy,
} from "@/lib/summary/production-schedule";
import {
  cacaoUtilizationPct,
  eventPlan,
  setCacaoUtilizationPct,
  shelfLifeDays,
  toggleUnavailableDay,
  unavailableDays,
} from "@/lib/summary/business-config";

const STRATEGIES: ScheduleStrategy[] = ["fastest", "balanced", "min_expiry"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Minutes as hours and minutes — "90" means nothing at a glance, "1h 30m" does. */
function formatMinutes(total: number): string {
  const mins = Math.round(total);
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function fromIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * One headline answer, which opens the tab that shows how it was worked out. Being a button
 * is the point: the summary and the detail are the same thing at two depths, and the tile
 * is how you get from one to the other.
 */
function SummaryTile({
  title,
  color,
  value,
  note,
  tone,
  active,
  onClick,
}: {
  title: string;
  color: string;
  value: string;
  note: string;
  tone?: "good" | "bad";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border bg-white px-5 py-4 text-left transition ${
        active ? "border-cacao shadow-sm" : tone === "bad" ? "border-danger/35 hover:border-cacao/40" : "border-line/15 hover:border-cacao/40"
      }`}
    >
      <div className="mb-1 flex items-center gap-2 border-b border-line/10 pb-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate font-display text-[17px] font-semibold">{title}</span>
      </div>
      {/* The figure itself is never red: 39 jars on the shelf is just a fact. What is or
          isn't a problem is the line under it, so that's what carries the colour. */}
      <div className="mt-0.5 font-display text-[22px] font-semibold text-foreground">{value}</div>
      <div
        className={`mt-0.5 truncate text-xs ${
          tone === "bad" ? "font-semibold text-danger" : tone === "good" ? "text-success" : "text-muted-foreground"
        }`}
        title={note}
      >
        {note}
      </div>
    </button>
  );
}

/** One month at a time, with a button per month; click a day to mark yourself off. */
function Calendar({
  days,
  today,
  nameOf,
  colorOf,
  onToggle,
}: {
  days: PlanDay[];
  today: string;
  nameOf: (id: string) => string;
  colorOf: (id: string) => string;
  onToggle: (date: string) => void;
}) {
  const months = new Map<string, PlanDay[]>();
  for (const d of days) months.set(d.date.slice(0, 7), [...(months.get(d.date.slice(0, 7)) ?? []), d]);
  const keys = [...months.keys()];
  const [index, setIndex] = useState(0);
  const shown = Math.min(index, keys.length - 1);
  const list = months.get(keys[shown]) ?? [];
  if (list.length === 0) return null;
  const lead = (fromIso(list[0].date).getDay() + 6) % 7;

  return (
    <div>
      {/* Arrows rather than a button per month, the same as Transactions — the months run on
          as far as the plan does, and a row of them would grow with it. */}
      <div className="mb-2 flex items-center gap-3">
        <div className="flex items-center rounded-full border border-line/15 bg-white">
          <button
            type="button"
            aria-label="Earlier month"
            disabled={shown === 0}
            onClick={() => setIndex(shown - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-l-full text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[140px] px-1 text-center text-[13px] font-semibold">
            {fromIso(list[0].date).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button
            type="button"
            aria-label="Later month"
            disabled={shown >= keys.length - 1}
            onClick={() => setIndex(shown + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-r-full text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-faint">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <span key={i} />
        ))}
        {list.map((d) => (
          <button
            key={d.date}
            type="button"
            disabled={d.status === "past"}
            onClick={() => onToggle(d.date)}
            title={
              d.status === "past"
                ? "Already passed"
                : d.status === "unavailable"
                  ? "You're off — click to make available"
                  : d.status === "no_equipment"
                    ? "No equipment runs this day — click to mark yourself off"
                    : "Click to mark yourself unavailable"
            }
            className={`flex min-h-[84px] flex-col gap-0.5 rounded-lg border p-1.5 text-left transition ${
              d.status === "past"
                ? "cursor-default border-transparent bg-[#F0EEE6]/60 opacity-50"
                : d.status === "unavailable"
                  ? "border-dashed border-line/25 bg-[repeating-linear-gradient(135deg,#EDEBE3_0_5px,transparent_5px_10px)]"
                  : d.status === "no_equipment"
                    ? "border-line/10 bg-white/60"
                    : "border-line/10 bg-white hover:bg-secondary"
            } ${d.date === today ? "ring-2 ring-cacao" : ""}`}
          >
            <span className="flex items-center justify-between">
              <span className={`text-[11px] font-semibold ${d.status === "open" ? "text-ink" : "text-muted-foreground"}`}>{Number(d.date.slice(8))}</span>
              {d.status === "unavailable" && <span className="text-[9px] font-semibold text-muted-foreground">Off</span>}
            </span>
            {d.eventNames.map((n) => (
              <span key={n} className="truncate text-[10px] font-semibold text-[#3F7CAC]">
                ⚑ {n}
              </span>
            ))}
            {d.runs.map((r) => (
              <span
                key={r.productId}
                className="truncate rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                style={{ background: colorOf(r.productId) }}
                title={`${nameOf(r.productId)}: ${pluralize(r.jars, "jar")} · ${formatMinutes(r.minutes)}`}
              >
                {nameOf(r.productId)} ×{r.jars}
              </span>
            ))}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const { products, rawMaterials, entries, machines, events, businessSettings } = useStore();
  const [viewMode] = useViewMode();
  const simple = viewMode === "simple";
  const [strategy, setStrategy] = useState<ScheduleStrategy>("fastest");
  const [tab, setTab] = useState<"shelf" | "make" | "schedule">("make");
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [eventDialog, setEventDialog] = useState<{ eventId?: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const now = new Date();
  const today = toIsoDate(now);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("en-US", { month: "long" });
  // What's made this month is what's sold next month, so the deadline and the demand it
  // covers are two different months — the tile used to show only the second one.
  const thisMonth = now.toLocaleDateString("en-US", { month: "long" });
  const editingProduct = products.find((p) => p.id === editingProductId) ?? null;
  const colorOf = (productId: string) => chipColor(Math.max(0, products.findIndex((p) => p.id === productId)));
  const nameOf = (productId: string) => products.find((p) => p.id === productId)?.name ?? "Product";

  const upcomingEvents = events.filter((e) => e.status === "open" && e.startDate && e.startDate.slice(0, 10) >= today);
  const eventPlans = useMemo(
    () => Object.fromEntries(events.map((e) => [e.id, eventPlan(businessSettings, e.id)])),
    [events, businessSettings],
  );

  const plan = useMemo(
    () =>
      buildProductionPlan({
        products,
        entries,
        machines,
        rawMaterials,
        events,
        eventPlans,
        unavailable: new Set(unavailableDays(businessSettings)),
        shelfLifeDays: (id) => shelfLifeDays(businessSettings, id),
        cacaoUtilization: cacaoUtilizationPct(businessSettings) / 100,
        strategy,
      }),
    [products, entries, machines, rawMaterials, events, eventPlans, businessSettings, strategy],
  );

  // Next month's demand is its expected sales plus anything an event that month has claimed —
  // see lib/summary/next-month-demand. Everything that asks "is this product covered?" reads
  // this one figure, so the warnings and the numbers can't tell different stories.
  const nextMonthDemand = useMemo(
    () => buildNextMonthDemand({ products, forecasts: plan.forecasts, events, eventPlans, now }),
    // `now` is a fresh Date each render; the month it falls in is what matters, and that
    // changes only when the other inputs already have.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, plan.forecasts, events, eventPlans],
  );
  const forecastOf = (id: string) => nextMonthDemand.get(id)?.sales_plus_events ?? 0;
  const salesForecastOf = (id: string) => nextMonthDemand.get(id)?.sales ?? 0;
  const low = products
    .map((p) => ({ p, need: forecastOf(p.id), belowWarning: p.stockQty <= p.lowStockThreshold }))
    .filter((x) => x.belowWarning || x.p.stockQty < x.need)
    .sort((a, b) => Number(b.belowWarning) - Number(a.belowWarning) || a.p.stockQty / Math.max(1, a.need) - b.p.stockQty / Math.max(1, b.need));
  const toMake = plan.needs.filter((n) => n.jarsToMake > 0);
  /**
   * What each upcoming event asks for, and how much of it the shelf already answers. An
   * event whose jars are all in stock changes no other number on this page, which reads
   * exactly like the event having been ignored — so it gets said out loud instead.
   */
  const eventNeeds = upcomingEvents
    .map((event) => {
      const lines = Object.entries(eventPlans[event.id] ?? {})
        .filter(([, qty]) => qty > 0)
        .map(([productId, qty]) => {
          const stock = products.find((p) => p.id === productId)?.stockQty ?? 0;
          return { qty, make: Math.max(0, qty - stock) };
        });
      const planned = lines.reduce((sum, l) => sum + l.qty, 0);
      const make = lines.reduce((sum, l) => sum + l.make, 0);
      return { event, planned, make };
    })
    .filter((e) => e.planned > 0);
  const jarsOnShelf = products.reduce((sum, p) => sum + p.stockQty, 0);
  const nextDay = plan.days.find((d) => d.status === "open" && d.runs.length > 0);
  const problem = plan.totalJarsToMake > 0 && (!plan.hasEquipment || plan.jarsLate > 0 || plan.jarsUnscheduled > 0);
  const utilization = cacaoUtilizationPct(businessSettings);
  const hasCacao = rawMaterials.some((m) => isRawCacao(m.name));
  const editingEvent = eventDialog?.eventId ? events.find((e) => e.id === eventDialog.eventId) : undefined;

  return (
    <Page
      title="Inventory"
      simpleTitle="Stock"
      right={
        simple ? undefined : (
        <>
          <button type="button" onClick={() => setAddStockOpen(true)} className="rounded-[10px] border border-line/20 bg-white px-4 py-2.5 text-[13px] font-semibold">
            Add stock
          </button>
          <button type="button" onClick={() => setAddProductOpen(true)} className="rounded-[10px] bg-cacao px-4 py-2.5 text-[13px] font-semibold text-ivory">
            + Add product
          </button>
        </>
        )
      }
    >
      {simple ? (
        <SimpleStock
          products={products}
          plan={plan}
          onMade={() => setAddStockOpen(true)}
          onAddProduct={() => setAddProductOpen(true)}
          onEditProduct={(id) => setEditingProductId(id)}
        />
      ) : (
      <div className="flex flex-col gap-5">
        {/* Without a machine every day has zero capacity, so nothing is ever placed on the
            calendar — which looks like the plan is broken rather than unconfigured. */}
        {!plan.hasEquipment && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/35 bg-danger/[0.04] px-5 py-4">
            <div className="min-w-0">
              <div className="font-display text-[17px] font-semibold">No equipment set up yet</div>
              <div className="text-[13px] text-muted-foreground">
                Nothing can land on the calendar until you say what you make with and how many batches a day it
                can do. Everything else on this page still works.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="shrink-0 rounded-[10px] bg-cacao px-4 py-2.5 text-[13px] font-semibold text-ivory"
            >
              Set up equipment
            </button>
          </div>
        )}
        {/* Three questions, in the order they get asked: what have I got, what should I make,
            when do I make it. Each tile is the headline answer and opens the tab that holds
            the working — the tiles used to carry the detail themselves, which is how one of
            them ended up with a list, two warnings and a per-event note inside it. */}
        <div className="grid grid-cols-1 gap-4 min-[1000px]:grid-cols-3">
          <SummaryTile
            title="On the shelf"
            color="#558A42"
            value={`${formatNumber(jarsOnShelf)} jars`}
            note={low.length === 0 ? `Every product covers ${nextMonth}` : `${pluralize(low.length, "product")} running low`}
            tone={low.length ? "bad" : "good"}
            active={tab === "shelf"}
            onClick={() => setTab("shelf")}
          />
          <SummaryTile
            title={`To make by end of ${thisMonth}`}
            color="#C08552"
            value={plan.totalJarsToMake > 0 ? `${formatNumber(plan.totalJarsToMake)} jars` : "Nothing"}
            note={
              plan.totalJarsToMake > 0
                ? `${formatMinutes(plan.totalMinutesNeeded)} of work · for ${nextMonth}${eventNeeds.length ? " and your events" : ""}`
                : `Stock already covers ${nextMonth} and your events`
            }
            tone={problem ? "bad" : undefined}
            active={tab === "make"}
            onClick={() => setTab("make")}
          />
          <SummaryTile
            title="Next production day"
            color="#7B4B2A"
            value={nextDay ? fromIso(nextDay.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—"}
            note={
              nextDay
                ? nextDay.runs.map((r) => `${nameOf(r.productId)} ×${r.jars}`).join(", ")
                : plan.hasEquipment
                  ? "Nothing scheduled"
                  : "No equipment set up yet"
            }
            active={tab === "schedule"}
            onClick={() => setTab("schedule")}
          />
        </div>

        <PageTabs
          tabs={[
            ["shelf", "On the shelf"],
            ["make", "What to make"],
            ["schedule", "Schedule"],
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "shelf" && (
          <ShelfTab
            products={products}
            rawMaterials={rawMaterials}
            forecastOf={forecastOf}
            salesForecastOf={salesForecastOf}
            nextMonth={nextMonth}
            onPickProduct={(p) => setEditingProductId(p.id)}
          />
        )}

        {tab === "make" && (
          <ToMakeTab
            plan={plan}
            utilization={utilization}
            hasCacao={hasCacao}
            onUtilizationChange={setCacaoUtilizationPct}
          />
        )}

        {tab === "schedule" && (
          <div className="flex flex-col gap-4 rounded-2xl border border-line/15 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-[17px] font-semibold">When to make it</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Batches placed on the days your equipment is free. Click a day to mark yourself off.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setShowSettings(true)} className="rounded-[10px] border border-line/20 bg-white px-3.5 py-2 text-xs font-semibold">
                  Equipment &amp; settings
                </button>
                <button type="button" onClick={() => setEventDialog({})} className="rounded-[10px] bg-cacao px-3.5 py-2 text-xs font-semibold text-ivory">
                  + Add event
                </button>
              </div>
            </div>

            {/* The chosen strategy's meaning in full, under the picker rather than only in a
                tooltip — three bare words were never going to explain themselves. */}
            <div className="rounded-xl border border-line/15 bg-secondary/50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[13px] font-semibold">Order the batches by</span>
                <div className="flex rounded-full bg-oat p-0.5 text-xs">
                  {STRATEGIES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStrategy(st)}
                      className={`rounded-full px-3 py-1 ${strategy === st ? "bg-white font-semibold shadow-sm" : "text-muted-foreground"}`}
                    >
                      {STRATEGY_LABELS[st]}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{STRATEGY_HINTS[strategy]}</p>
            </div>

            {/* Said here, not only in the banner at the top of the page: an empty calendar
                beside a "7 jars to make" tile reads as broken rather than unconfigured, and
                the explanation needs to be where the emptiness is. */}
            {plan.hasEquipment && plan.productsMissingMinutes.length > 0 && (
              <div className="rounded-xl border border-danger/35 bg-danger/[0.04] px-5 py-4">
                <p className="text-[13px] font-semibold text-danger">
                  {`No time recorded for ${listPhrase(plan.productsMissingMinutes)}, so ${
                    plan.productsMissingMinutes.length === 1 ? "its jars" : "their jars"
                  } can't be fitted into a day.`}
                </p>
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="mt-2 rounded-[10px] bg-cacao px-3.5 py-2 text-xs font-semibold text-ivory"
                >
                  Set how long a jar takes
                </button>
              </div>
            )}

            {!plan.hasEquipment ? (
              <div className="rounded-xl border border-dashed border-line/30 px-5 py-10 text-center">
                <p className="font-display text-[17px] font-semibold">Nothing can be scheduled yet</p>
                <p className="mx-auto mt-1 max-w-[460px] text-[13px] text-muted-foreground">
                  {plan.totalJarsToMake > 0
                    ? `There ${pluralize(plan.totalJarsToMake, "jar")} to make — about ${formatMinutes(
                        plan.totalMinutesNeeded,
                      )} of work — but no equipment to make them on, so no day has any time in it.`
                    : "Say what you make on and how many hours a day it runs, and the jars will land on the days below."}
                </p>
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="mt-4 rounded-[10px] bg-cacao px-4 py-2.5 text-[13px] font-semibold text-ivory"
                >
                  Set up equipment
                </button>
              </div>
            ) : null}

            <Calendar
              days={plan.days}
              today={today}
              nameOf={nameOf}
              colorOf={colorOf}
              onToggle={(date) => toggleUnavailableDay(businessSettings, date)}
            />

            {toMake.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line/10 pt-3 text-xs">
                {toMake.map((n) => (
                  <span key={n.productId} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(n.productId) }} />
                    <span className="font-semibold">{n.productName}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {addStockOpen && (
        <AddStockDialog
          products={products}
          onClose={() => setAddStockOpen(false)}
          onAddProduct={() => {
            setAddStockOpen(false);
            setAddProductOpen(true);
          }}
        />
      )}
      {addProductOpen && <AddProductDialog products={products} onClose={() => setAddProductOpen(false)} />}
      {editingProduct && (
        <EditProductDialog key={editingProduct.id} product={editingProduct} products={products} onClose={() => setEditingProductId(null)} />
      )}
      {showSettings && (
        <PlanSettingsDialog
          upcomingEvents={upcomingEvents}
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
          event={editingEvent}
          plan={editingEvent ? eventPlans[editingEvent.id] : undefined}
          onClose={() => setEventDialog(null)}
        />
      )}
    </Page>
  );
}
