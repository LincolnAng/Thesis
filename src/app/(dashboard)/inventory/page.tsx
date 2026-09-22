"use client";

import { useMemo, useState } from "react";
import { Page, PageTabs } from "@/components/layout/page";
import { EventPlanDialog } from "@/components/inventory/event-plan-dialog";
import { PlanSettingsDialog } from "@/components/inventory/plan-settings-dialog";
import { AddStockDialog } from "@/components/stock/add-stock-dialog";
import { AddProductDialog, EditProductDialog } from "@/components/stock/edit-product-dialog";
import { stockLevel } from "@/components/data-table/stock-level";
import { useStore } from "@/lib/store/use-store";
import { chipColor } from "@/lib/chart-colors";
import { formatNumber, pluralize } from "@/lib/format";
import { MOVING_AVERAGE_MONTHS } from "@/lib/summary/forecast";
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
import type { Product } from "@/lib/store/types";

const STRATEGIES: ScheduleStrategy[] = ["fastest", "balanced", "min_expiry"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fromIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function TileHeader({ title, color }: { title: string; color: string }) {
  return (
    <div className="mb-1 flex items-center gap-2 border-b border-line/10 pb-2">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="font-display text-[17px] font-semibold">{title}</span>
    </div>
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
  const list = months.get(keys[Math.min(index, keys.length - 1)]) ?? [];
  if (list.length === 0) return null;
  const lead = (fromIso(list[0].date).getDay() + 6) % 7;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">{fromIso(list[0].date).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
        <div className="flex gap-1">
          {keys.map((k, i) => (
            <button
              key={k}
              type="button"
              onClick={() => setIndex(i)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold ${i === index ? "bg-cacao/10 text-cacao" : "text-muted-foreground hover:bg-secondary"}`}
            >
              {fromIso(`${k}-01`).toLocaleDateString("en-US", { month: "short" })}
            </button>
          ))}
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
                title={`${nameOf(r.productId)}: ${pluralize(r.batches, "batch", "batches")}${r.jars ? ` (${r.jars} jars)` : ""}`}
              >
                {nameOf(r.productId)} ×{r.batches}
              </span>
            ))}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One row per product: the bar is stock on hand, the black tick is next month's expected
 * sales. Least-covered products first. */
function StockVsForecast({
  products,
  forecastOf,
  onPick,
}: {
  products: Product[];
  forecastOf: (id: string) => number;
  onPick: (p: Product) => void;
}) {
  const max = Math.max(10, ...products.map((p) => Math.max(p.stockQty, forecastOf(p.id)))) * 1.05;
  const rows = products
    .map((p) => ({ p, f: forecastOf(p.id), gap: p.stockQty - forecastOf(p.id) }))
    .sort((a, b) => a.p.stockQty / Math.max(1, a.f) - b.p.stockQty / Math.max(1, b.f));

  return (
    <div className="flex flex-col">
      {rows.map(({ p, f, gap }) => {
        const short = gap < 0;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            title="Click to edit"
            className="-mx-2 grid grid-cols-[minmax(0,190px)_1fr_210px] items-center gap-5 rounded-lg px-2 py-2 text-left hover:bg-secondary"
          >
            <span className="truncate text-[13px] font-medium">{p.name}</span>
            <span className="relative h-5 rounded bg-[#F0EEE6]">
              <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${(p.stockQty / max) * 100}%`, background: short ? "#B3261E" : "#7B4B2A" }} />
              <span className="absolute -bottom-1 -top-1 w-[3px] rounded-full bg-ink" style={{ left: `calc(${(f / max) * 100}% - 1px)` }} />
            </span>
            <span className="grid grid-cols-[1fr_84px] items-center gap-3 text-[12px]">
              <span className="whitespace-nowrap text-right text-muted-foreground">
                {p.stockQty} / {f} jars
              </span>
              <span className={`rounded-md py-0.5 text-center font-semibold text-white ${short ? "bg-danger" : "bg-success"}`}>
                {short ? `Short: ${-gap}` : `Spare: ${gap}`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function InventoryPage() {
  const { products, rawMaterials, entries, machines, events, businessSettings } = useStore();
  const [strategy, setStrategy] = useState<ScheduleStrategy>("fastest");
  const [tab, setTab] = useState<"plan" | "stock">("plan");
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [eventDialog, setEventDialog] = useState<{ eventId?: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const now = new Date();
  const today = toIsoDate(now);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("en-US", { month: "long" });
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

  const forecastOf = (id: string) => plan.forecasts.find((f) => f.productId === id)?.forecastQty ?? 0;
  // The months the forecast averages: the most recent complete months with sales.
  const basisMonths = [...new Set(plan.forecasts.flatMap((f) => f.history.slice(-MOVING_AVERAGE_MONTHS).map((h) => h.month)))]
    .sort()
    .slice(-MOVING_AVERAGE_MONTHS)
    .map((k) => fromIso(`${k}-01`).toLocaleDateString("en-US", { month: "short" }));

  const low = products
    .map((p) => ({ p, need: forecastOf(p.id), belowWarning: p.stockQty <= p.lowStockThreshold }))
    .filter((x) => x.belowWarning || x.p.stockQty < x.need)
    .sort((a, b) => Number(b.belowWarning) - Number(a.belowWarning) || a.p.stockQty / Math.max(1, a.need) - b.p.stockQty / Math.max(1, b.need));
  const toMake = plan.needs.filter((n) => n.jarsToMake > 0);
  const nextDay = plan.days.find((d) => d.status === "open" && d.runs.length > 0);
  const problem = plan.totalJarsToMake > 0 && (!plan.hasEquipment || plan.batchesLate > 0 || plan.batchesUnscheduled > 0);
  const utilization = cacaoUtilizationPct(businessSettings);
  const hasCacao = rawMaterials.some((m) => isRawCacao(m.name));
  const editingEvent = eventDialog?.eventId ? events.find((e) => e.id === eventDialog.eventId) : undefined;

  return (
    <Page
      title="Inventory"
      right={
        <>
          <button type="button" onClick={() => setAddStockOpen(true)} className="rounded-[10px] border border-line/20 bg-white px-4 py-2.5 text-[13px] font-semibold">
            Add stock
          </button>
          <button type="button" onClick={() => setAddProductOpen(true)} className="rounded-[10px] bg-cacao px-4 py-2.5 text-[13px] font-semibold text-ivory">
            + Add product
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 min-[1000px]:grid-cols-3">
          <div className={`rounded-2xl border bg-white px-5 py-4 ${low.length ? "border-danger/35" : "border-line/15"}`}>
            <TileHeader title="Running low" color="#B3261E" />
            {low.length === 0 ? (
              <>
                <div className="mt-0.5 font-display text-[22px] font-semibold text-success">All good</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Every product covers {nextMonth}&apos;s forecast</div>
              </>
            ) : (
              <div className="mt-1.5 flex flex-col gap-1">
                {low.slice(0, 4).map(({ p, need, belowWarning }) => (
                  <div
                    key={p.id}
                    className="flex items-baseline justify-between gap-3 text-[13px]"
                    title={belowWarning ? `Below your warning level of ${p.lowStockThreshold}` : `${nextMonth} forecast is ${need}`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 whitespace-nowrap">
                      <span className={`font-semibold ${belowWarning ? "text-danger" : "text-[#9A6B12]"}`}>{p.stockQty} jars</span>
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        / {need > p.stockQty ? `needs ${need}` : `warn below ${p.lowStockThreshold}`}
                      </span>
                    </span>
                  </div>
                ))}
                {low.length > 4 && (
                  <button type="button" onClick={() => setTab("stock")} className="mt-0.5 self-start text-xs font-semibold text-cacao">
                    +{low.length - 4} more — see Stock & forecast
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={`rounded-2xl border bg-white px-5 py-4 ${problem ? "border-danger/35" : "border-line/15"}`}>
            <TileHeader title={`To make by end of ${nextMonth}`} color="#C08552" />
            {toMake.length === 0 ? (
              <>
                <div className="mt-0.5 font-display text-[22px] font-semibold">Nothing</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Stock covers the forecast and events</div>
              </>
            ) : (
              <div className="mt-1.5 flex flex-col gap-1">
                {toMake.slice(0, 4).map((n) => (
                  <div
                    key={n.productId}
                    className="flex items-baseline justify-between gap-3 text-[13px]"
                    title={`${nextMonth} forecast ${n.forecastQty} + events ${n.eventQty} − on hand ${n.onHand}`}
                  >
                    <span className="truncate">{n.productName}</span>
                    <span className="shrink-0 whitespace-nowrap">
                      <span className="font-semibold">{n.jarsToMake} jars</span>
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · {n.missingYield ? "set jars per batch" : pluralize(n.batchesNeeded, "batch", "batches")}
                      </span>
                    </span>
                  </div>
                ))}
                {toMake.length > 4 && <div className="text-xs text-muted-foreground">+{toMake.length - 4} more</div>}
                {problem && (
                  <div className="mt-0.5 text-[11px] font-semibold text-danger">
                    {!plan.hasEquipment
                      ? "Add your equipment in Settings to schedule it"
                      : `${pluralize(plan.batchesLate + plan.batchesUnscheduled, "batch", "batches")} won't be ready in time`}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-cacao/40 bg-white px-5 py-4">
            <TileHeader title="Next production day" color="#7B4B2A" />
            <div className="mt-0.5 font-display text-[22px] font-semibold text-cacao">
              {nextDay ? fromIso(nextDay.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—"}
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {nextDay ? nextDay.runs.map((r) => `${nameOf(r.productId)} ×${r.batches}`).join(", ") : "Nothing scheduled"}
            </div>
          </div>
        </div>

        <PageTabs
          tabs={[
            ["plan", "Production plan"],
            ["stock", "Stock & forecast"],
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "plan" ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-line/15 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-semibold text-muted-foreground">Schedule</span>
                <div className="flex rounded-full bg-oat p-0.5 text-xs">
                  {STRATEGIES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStrategy(st)}
                      title={STRATEGY_HINTS[st]}
                      className={`rounded-full px-3 py-1 ${strategy === st ? "bg-white font-semibold shadow-sm" : "text-muted-foreground"}`}
                    >
                      {STRATEGY_LABELS[st]}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{STRATEGY_HINTS[strategy]}</span>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setShowSettings(true)} className="rounded-[10px] border border-line/20 bg-white px-3.5 py-2 text-xs font-semibold">
                  Settings
                </button>
                <button type="button" onClick={() => setEventDialog({})} className="rounded-[10px] bg-cacao px-3.5 py-2 text-xs font-semibold text-ivory">
                  + Add event
                </button>
              </div>
            </div>

            <Calendar
              days={plan.days}
              today={today}
              nameOf={nameOf}
              colorOf={colorOf}
              onToggle={(date) => toggleUnavailableDay(businessSettings, date)}
            />

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line/10 pt-3 text-xs">
              {toMake.map((n) => (
                <span key={n.productId} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(n.productId) }} />
                  <span className="font-semibold">{n.productName}</span>
                </span>
              ))}
              <span className="ml-auto text-muted-foreground">Click a day to mark yourself off</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl border border-line/15 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  Stock on hand vs. forecast for {nextMonth} {new Date(now.getFullYear(), now.getMonth() + 1, 1).getFullYear()}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {basisMonths.length
                    ? `Forecast = average monthly sales from ${basisMonths.join(", ")} (${MOVING_AVERAGE_MONTHS}-month moving average)`
                    : "No complete months of sales yet — the forecast fills in as sales are logged"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-3 rounded-sm bg-cacao" />
                  On hand
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3.5 w-[3px] rounded-full bg-ink" />
                  Expected to sell in {nextMonth}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-3 rounded-sm bg-danger" />
                  Not enough
                </span>
              </div>
            </div>
            <StockVsForecast products={products} forecastOf={forecastOf} onPick={(p) => setEditingProductId(p.id)} />
            <div className="grid grid-cols-1 gap-4 border-t border-line/10 pt-3 text-xs text-muted-foreground min-[1000px]:grid-cols-[1fr_auto]">
              {rawMaterials.length > 0 && (
                <div className="leading-relaxed">
                  <span className="font-semibold text-ink">Raw materials: </span>
                  {rawMaterials.map((m, i) => (
                    <span key={m.id}>
                      {i > 0 && " · "}
                      {m.name}{" "}
                      <span className={`font-semibold ${stockLevel(m.qty, m.lowStockThreshold) === "low" ? "text-danger" : "text-ink"}`}>
                        {formatNumber(m.qty)} {m.unit}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {hasCacao && (
                <label className="flex items-center gap-2 self-start whitespace-nowrap">
                  Cacao utilization
                  <input
                    type="range"
                    min={30}
                    max={100}
                    value={utilization}
                    onChange={(e) => setCacaoUtilizationPct(Number(e.target.value))}
                    className="h-1 w-28 accent-cacao"
                    aria-label="Cacao utilization rate"
                  />
                  <span className="w-8 font-semibold text-ink">{utilization}%</span>
                  <span>usable after roasting</span>
                </label>
              )}
            </div>
          </div>
        )}
      </div>

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
