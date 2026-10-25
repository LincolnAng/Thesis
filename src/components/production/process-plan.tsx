"use client";

import { familiesOf, fullName, sizeName } from "@/lib/summary/product-sizes";
import { useMemo, useState } from "react";
import { Pill } from "@/components/ui/kit";
import { Check, ChevronDown, Package, Sprout } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { forecastAll } from "@/lib/summary/forecast";
import { allStandings } from "@/lib/summary/material-stock";
import { productExpiry, sellableBy } from "@/lib/summary/product-lots";
import { rawQuantityNeeded } from "@/lib/summary/cacao";
import { cacaoUtilizationPct, eventPlan, expiringWithinDays, multipliersFor, shelfLifeDays } from "@/lib/summary/business-config";
import { planProduction } from "@/lib/production/plan";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { getUnitCost } from "@/lib/summary/cost-engine";
import { formatPeso } from "@/lib/format";

/**
 * Production's one job: say how much is short for next month, at a glance.
 *
 * It starts from the demand projection — next month's expected sales plus what upcoming events
 * plan to take — and works back to the raw materials that demand needs. Two lists side by side:
 * raw materials on the left, finished products on the right. Each line is a name and how many
 * are short, nothing else; what has enough folds into one line underneath. A product sold in
 * several sizes lists each size, because a spare 500 g jar doesn't cover a missing 250 g one.
 */
export function ProcessPlan({ details, onPickProduct }: { details?: React.ReactNode; onPickProduct?: (productId: string) => void } = {}) {
  const { products, rawMaterials, entries, events, businessSettings, loadedFromServer } = useStore();
  const costCtx = useCostContext();

  const plan = useMemo(() => {
    const now = new Date();
    const utilization = cacaoUtilizationPct(businessSettings) / 100;
    const window = expiringWithinDays(businessSettings);

    // Demand: next month's forecast, plus what upcoming events plan to take.
    const demand = new Map<string, number>();
    for (const f of forecastAll(products, entries, now, (id) => multipliersFor(businessSettings, id))) demand.set(f.productId, f.forecastQty);
    const today = now.toISOString().slice(0, 10);
    for (const e of events.filter((x) => x.status === "open" && (!x.startDate || x.startDate.slice(0, 10) >= today))) {
      for (const [productId, qty] of Object.entries(eventPlan(businessSettings, e.id))) {
        demand.set(productId, (demand.get(productId) ?? 0) + Math.max(0, qty));
      }
    }

    // On hand: only what will still be good by the end of next month.
    const needBy = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);
    const onHand = new Map<string, number>();
    for (const p of products) {
      const expiry = productExpiry(entries, p, shelfLifeDays(businessSettings, p.id), window, now, products);
      onHand.set(p.id, expiry.tracksAnything ? sellableBy(expiry, needBy) : p.stockQty);
    }

    const materials = allStandings(entries, products, rawMaterials, utilization).map((s) => ({
      id: s.material.id,
      name: s.material.name,
      unit: s.material.unit,
      onHand: Math.max(0, s.onHand),
      reorderPoint: s.material.reorderPoint ?? s.material.lowStockThreshold ?? 0,
    }));

    return planProduction({
      products,
      materials,
      demand,
      onHand,
      rawPerBatch: (m, qty) => rawQuantityNeeded(m.name, qty, utilization),
    });
  }, [products, rawMaterials, entries, events, businessSettings]);

  const [showMonths, setShowMonths] = useState(false);

  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("en-US", { month: "long" });

  // ── Left: raw materials (and packaging) the plan draws on ─────────────────
  const materialRows: Row[] = plan.materials
    .filter((m) => m.required > 0)
    .map((m) => ({ key: m.materialId, name: m.name, short: up(m.toBuy), unit: m.unit, title: `Need ${m.required} ${m.unit} · have ${m.onHand}` }))
    .sort(byShort);

  const unitCostOf = (id: string) => getUnitCost(id, costCtx.rawMaterials, costCtx.supplierPrices, costCtx.entries, costCtx.products, costCtx.cacaoUtilization);
  const toBuy = plan.materials.filter((m) => m.toBuy > 0);
  const buyTotal = toBuy.reduce((t, m) => {
    const u = unitCostOf(m.materialId);
    return t + (u.source === "none" ? 0 : u.cost * m.toBuy);
  }, 0);

  // ── Right: finished products, a family at a time with each size its own line ──
  const productPlan = new Map(plan.products.map((p) => [p.productId, p]));
  const productGroups: Group[] = familiesOf(products)
    .map((fam) => {
      const rows: Row[] = fam.all
        .map((p) => productPlan.get(p.id))
        .filter((x): x is NonNullable<typeof x> => !!x && x.need > 0)
        .map((x) => ({
          key: x.productId,
          name: fam.all.length > 1 ? sizeName(products.find((p) => p.id === x.productId)!) : fullName(fam.head, products),
          short: Math.ceil(x.shortfall),
          unit: x.unit,
          title: `Need ${x.need} · have ${x.onHand}`,
        }))
        .sort(byShort);
      return { key: fam.head.id, name: fam.head.name, sized: fam.all.length > 1, rows };
    })
    .filter((g) => g.rows.length > 0)
    .sort((a, b) => shortOf(b) - shortOf(a) || a.name.localeCompare(b.name));

  const materialsShort = materialRows.filter((r) => r.short > 0).length;
  const productsShort = productGroups.reduce((t, g) => t + g.rows.filter((r) => r.short > 0).length, 0);

  // Until the shop's records arrive everything reads as covered, which is the one wrong answer
  // this page mustn't give, so it says it's still checking instead.
  if (!loadedFromServer) {
    return (
      <Panel title={`What ${month} needs`} note="Loading the shop's records…">
        <div className="flex flex-col gap-3" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded-full bg-track" />
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={`What ${month} needs`} note="How much is short for your usual sales plus planned events.">
      {productGroups.length === 0 ? (
        <p className="text-[13.5px] text-muted-foreground">
          No sales expected for {month} yet. Log a few sales or plan an event, and this fills in on its own.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
          <Side id="what-to-buy" icon={<Sprout className="h-4 w-4" />} title="Raw materials" shortCount={materialsShort}>
            {materialRows.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No recipe uses a raw material yet — add them in Costing.</p>
            ) : (
              <ShortList rows={materialRows} />
            )}
            {buyTotal > 0 && (
              <p className="mt-3 border-t border-line/10 pt-2 text-[12.5px] text-muted-foreground">
                About <b className="text-foreground">{formatPeso(buyTotal)}</b> to buy what&apos;s short
              </p>
            )}
          </Side>

          <Side id="what-to-make" icon={<Package className="h-4 w-4" />} title="Finished products" shortCount={productsShort}>
            <ProductList groups={productGroups} onPick={onPickProduct} />
          </Side>
        </div>
      )}

      {/* The months after this one, tucked under the demand they extend. */}
      {details && (
        <div className="mt-4 border-t border-line/10 pt-3">
          <button
            type="button"
            onClick={() => setShowMonths((v) => !v)}
            aria-expanded={showMonths}
            aria-controls="next-months"
            className="group flex items-center gap-1.5 text-[13px] font-semibold text-cacao"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showMonths ? "rotate-180" : "group-hover:translate-y-0.5"}`} />
            {showMonths ? "Hide the months after" : `See the months after ${month}, and busy and quiet months`}
          </button>
          {showMonths && (
            <div id="next-months" className="mt-2">
              {details}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

/** One line: a name and how many are short, in its own unit. 0 means there's enough. */
interface Row {
  key: string;
  name: string;
  short: number;
  unit: string;
  /** Need and have, on hover — kept off the line itself. */
  title: string;
}

/** A product family: one row per size, or a single row when it has no sizes. */
interface Group {
  key: string;
  name: string;
  sized: boolean;
  rows: Row[];
}

/** Rounded up, so "short 0.004 kg" never reads as 0 — and never as 0.0040000001. */
const up = (n: number) => Math.ceil(n * 100) / 100;
const byShort = (a: Row, b: Row) => b.short - a.short || a.name.localeCompare(b.name);
const shortOf = (g: Group) => g.rows.reduce((t, r) => t + (r.short > 0 ? 1 : 0), 0);

function Side({ id, icon, title, shortCount, children }: { id: string; icon: React.ReactNode; title: string; shortCount: number; children: React.ReactNode }) {
  return (
    <section id={id} className="min-w-0 scroll-mt-24 rounded-xl border border-line/15 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
          {icon}
          {title}
        </p>
        <Pill tone={shortCount ? "bad" : "good"}>{shortCount ? `${shortCount} short` : "All enough"}</Pill>
      </div>
      {children}
    </section>
  );
}

function Amount({ row }: { row: Row }) {
  return row.short > 0 ? (
    <span className="shrink-0 whitespace-nowrap tabular-nums text-danger">
      <b className="text-[16px]">{row.short.toLocaleString("en-US")}</b>
      <span className="text-[12px] font-semibold"> {row.unit} short</span>
    </span>
  ) : (
    <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={3} aria-label="Enough" />
  );
}

/** What's short, one per line; everything with enough folds into a single line below. */
function ShortList({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState(false);
  const short = rows.filter((r) => r.short > 0);
  const enough = rows.filter((r) => r.short <= 0);
  return (
    <>
      <ul className="divide-y divide-line/10">
        {(open ? rows : short).map((r) => (
          <li key={r.key} title={r.title} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className={`min-w-0 truncate text-[14px] ${r.short > 0 ? "font-semibold" : "text-muted-foreground"}`}>{r.name}</span>
            <Amount row={r} />
          </li>
        ))}
      </ul>
      <EnoughToggle count={enough.length} open={open} onToggle={() => setOpen((v) => !v)} />
    </>
  );
}

function ProductList({ groups, onPick }: { groups: Group[]; onPick?: (productId: string) => void }) {
  const [open, setOpen] = useState(false);
  const isShort = (g: Group) => g.rows.some((r) => r.short > 0);
  const enough = groups.filter((g) => !isShort(g));
  const name = (g: Group, cls: string) => (
    <button
      type="button"
      onClick={() => onPick?.(g.key)}
      title="Edit this product"
      className={`min-w-0 truncate text-left text-[14px] decoration-cacao/40 underline-offset-2 hover:underline ${cls}`}
    >
      {g.name}
    </button>
  );
  return (
    <>
      <ul className="divide-y divide-line/10">
        {(open ? groups : groups.filter(isShort)).map((g) => {
          const short = isShort(g);
          return g.sized ? (
            <li key={g.key} className="py-1.5">
              {name(g, short ? "font-semibold" : "text-muted-foreground")}
              <ul className="mt-0.5">
                {g.rows.map((r) => (
                  <li key={r.key} title={r.title} className="flex items-baseline justify-between gap-3 py-0.5 pl-4">
                    <span className={`min-w-0 truncate text-[13px] ${r.short > 0 ? "" : "text-muted-foreground"}`}>{r.name}</span>
                    <Amount row={r} />
                  </li>
                ))}
              </ul>
            </li>
          ) : (
            <li key={g.key} title={g.rows[0].title} className="flex items-baseline justify-between gap-3 py-1.5">
              {name(g, short ? "font-semibold" : "text-muted-foreground")}
              <Amount row={g.rows[0]} />
            </li>
          );
        })}
      </ul>
      <EnoughToggle count={enough.length} open={open} onToggle={() => setOpen((v) => !v)} />
    </>
  );
}

function EnoughToggle({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  if (count === 0) return null;
  return (
    <button type="button" onClick={onToggle} className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-success">
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
      {open ? "Hide the ones with enough" : `${count} more ${count === 1 ? "has" : "have"} enough`}
    </button>
  );
}

/**
 * Every card on Production and Calendar: a display-font title, an optional line under it and
 * something on the right (a legend), over its contents. `flush` lets a table run to the card's
 * edges, with the title still padded in.
 */
export function Panel({
  title,
  note,
  aside,
  id,
  flush,
  children,
}: {
  title: string;
  note?: string;
  aside?: React.ReactNode;
  id?: string;
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`h-full scroll-mt-24 rounded-2xl border border-line/15 bg-card ${flush ? "overflow-hidden" : "p-5"}`}>
      {/* The right-hand side stays put on wide screens; the line under the title wraps beside it. */}
      <div className={`mb-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2 min-[900px]:flex-nowrap ${flush ? "px-5 pt-4" : ""}`}>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[17px] font-semibold">{title}</h3>
          {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
        </div>
        {aside && <div className="max-w-full min-[900px]:shrink-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
