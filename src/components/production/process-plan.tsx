"use client";

import { Fragment, useMemo, useState } from "react";
import { CarouselNav } from "@/components/ui/carousel-nav";
import { Pill } from "@/components/ui/kit";
import { ArrowDown, ArrowRight, Check as Check2, ChevronDown, Factory, Package, ShoppingCart, Sprout, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { forecastAll } from "@/lib/summary/forecast";
import { allStandings } from "@/lib/summary/material-stock";
import { productExpiry, sellableBy } from "@/lib/summary/product-lots";
import { rawQuantityNeeded } from "@/lib/summary/cacao";
import { cacaoUtilizationPct, eventPlan, expiringWithinDays, multipliersFor, shelfLifeDays } from "@/lib/summary/business-config";
import { planProduction, processChain, type PlanAlert } from "@/lib/production/plan";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { getUnitCost } from "@/lib/summary/cost-engine";
import { formatPeso, pluralize } from "@/lib/format";

/**
 * Production's one job: say whether anything is short for next month, anywhere in the process.
 *
 * It starts from the demand projection — next month's expected sales plus what upcoming events
 * plan to take — because everything else follows from it: the finished products that demand
 * needs, then the raw materials and the packaging to make them. Each of those three is a check
 * that is either covered (green) or names what's short in one plain line, with what to do.
 *
 * Written for someone new to this, so there are no tables and one simple bar per product. The
 * recipe flowchart and the month-by-month working sit behind "See how it's worked out".
 */
export function ProcessPlan({ details, onPickProduct }: { details?: React.ReactNode; onPickProduct?: (productId: string) => void } = {}) {
  const { products, rawMaterials, entries, events, businessSettings, loadedFromServer } = useStore();
  const costCtx = useCostContext();

  const result = useMemo(() => {
    const now = new Date();
    const utilization = cacaoUtilizationPct(businessSettings) / 100;
    const window = expiringWithinDays(businessSettings);

    // Demand: next month's forecast, plus what upcoming events plan to take.
    const demand = new Map<string, number>();
    const usual = new Map<string, number>();
    const guess = new Map<string, string>();
    const forEvents = new Map<string, { name: string; qty: number }[]>();
    for (const f of forecastAll(products, entries, now, (id) => multipliersFor(businessSettings, id))) {
      demand.set(f.productId, f.forecastQty);
      usual.set(f.productId, f.forecastQty);
      guess.set(f.productId, f.reliability.level);
    }
    const today = now.toISOString().slice(0, 10);
    for (const e of events.filter((x) => x.status === "open" && (!x.startDate || x.startDate.slice(0, 10) >= today))) {
      for (const [productId, qty] of Object.entries(eventPlan(businessSettings, e.id))) {
        demand.set(productId, (demand.get(productId) ?? 0) + Math.max(0, qty));
        if (qty > 0) forEvents.set(productId, [...(forEvents.get(productId) ?? []), { name: e.name, qty }]);
      }
    }

    // On hand: only what will still be good by the end of next month.
    const needBy = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);
    const onHand = new Map<string, number>();
    const expiringAlerts: PlanAlert[] = [];
    for (const p of products) {
      const expiry = productExpiry(entries, p, shelfLifeDays(businessSettings, p.id), window, now, products);
      onHand.set(p.id, expiry.tracksAnything ? sellableBy(expiry, needBy) : p.stockQty);
      for (const lot of expiry.lots) {
        if (lot.daysLeft < 0) {
          expiringAlerts.push({
            kind: "produce",
            productId: p.id,
            urgent: true,
            title: `${lot.qty} ${p.name} past their date`,
            detail: `From the batch made ${fmt(lot.madeOn)} — expired ${fmt(lot.expiresOn)}. Log them as spoilage so stock stays true.`,
          });
        } else if (lot.daysLeft <= window) {
          expiringAlerts.push({
            kind: "produce",
            productId: p.id,
            urgent: false,
            title: `${lot.qty} ${p.name} expire in ${lot.daysLeft} day${lot.daysLeft === 1 ? "" : "s"}`,
            detail: `From the batch made ${fmt(lot.madeOn)}. Sell these first.`,
          });
        }
      }
    }

    const materials = allStandings(entries, products, rawMaterials, utilization).map((s) => ({
      id: s.material.id,
      name: s.material.name,
      unit: s.material.unit,
      kind: s.material.kind,
      onHand: Math.max(0, s.onHand),
      reorderPoint: s.material.reorderPoint ?? s.material.lowStockThreshold ?? 0,
    }));

    const plan = planProduction({
      products,
      materials,
      demand,
      onHand,
      rawPerBatch: (m, qty) => rawQuantityNeeded(m.name, qty, utilization),
    });
    return { plan, chain: processChain(products, materials), expiringAlerts, usual, guess, forEvents };
  }, [products, rawMaterials, entries, events, businessSettings]);

  const { plan, chain, expiringAlerts, usual, guess, forEvents } = result;
  const buying = plan.materials.filter((m) => m.required > 0 || m.belowReorderPoint);

  // ── Money: what buying the shortfall costs ──────────────────────────────
  const unitCostOf = (id: string) => getUnitCost(id, costCtx.rawMaterials, costCtx.supplierPrices, costCtx.entries, costCtx.products, costCtx.cacaoUtilization);
  const buyCost = (materialId: string, qty: number) => {
    const u = unitCostOf(materialId);
    return u.source === "none" ? null : u.cost * qty;
  };
  const toBuy = buying.filter((m) => m.toBuy > 0);
  const buyTotal = toBuy.reduce((t, m) => t + (buyCost(m.materialId, m.toBuy) ?? 0), 0);
  const unpricedBuys = toBuy.filter((m) => buyCost(m.materialId, m.toBuy) === null);

  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("en-US", { month: "long" });
  const packagingIds = new Set(rawMaterials.filter((m) => m.kind === "packaging").map((m) => m.id));

  // ── 1. The demand: one row per product anything is expected of, least covered first ──────
  const demandRows = plan.products.filter((p) => p.need > 0).sort((a, b) => a.onHand / a.need - b.onHand / b.need);
  /** Where a product's number comes from, in words: usual sales + each event + other products. */
  const whyNeeded = (p: (typeof plan.products)[number]) => {
    const parts: string[] = [];
    const u = usual.get(p.productId) ?? 0;
    if (u > 0) parts.push(`${u} from usual sales`);
    for (const e of forEvents.get(p.productId) ?? []) parts.push(`${e.qty} for ${e.name}`);
    if (p.usedByOthers > 0) parts.push(`${p.usedByOthers} go into other products`);
    return parts.join(" + ");
  };

  // ── 2. The flowchart, every stage checked against that demand ─────────────────────────
  const productPlan = new Map(plan.products.map((p) => [p.productId, p]));
  const materialPlan = new Map(plan.materials.map((m) => [m.materialId, m]));
  const expiringBy = new Map<string, PlanAlert[]>();
  for (const a of expiringAlerts) if (a.productId) expiringBy.set(a.productId, [...(expiringBy.get(a.productId) ?? []), a]);

  const materialItem = (id: string, name: string, shared = false): FlowItem => {
    const m = materialPlan.get(id);
    const forAll = shared ? " for all products" : "";
    if (!m || (m.required <= 0 && !m.belowReorderPoint)) return { key: id, name, tone: "idle", line: `Not needed for ${month}` };
    if (m.toBuy > 0) {
      const cost = buyCost(m.materialId, m.toBuy);
      return {
        key: id,
        name,
        tone: "short",
        line: `Need ${m.required} ${m.unit}${forAll} · have ${m.onHand}`,
        action: `Buy ${m.toBuy} ${m.unit}`,
        aside: cost != null ? `about ${formatPeso(cost)}` : "no price yet",
      };
    }
    if (m.belowReorderPoint)
      return { key: id, name, tone: "watch", line: `Enough for ${month}, but down to ${m.onHand} ${m.unit}`, note: `Top up soon — your restock point is ${m.reorderPoint} ${m.unit}.` };
    return { key: id, name, tone: "ok", line: `Enough · need ${m.required} ${m.unit}${forAll}, have ${m.onHand}` };
  };
  const productItem = (id: string, name: string): FlowItem => {
    const p = productPlan.get(id);
    const expiring = (expiringBy.get(id) ?? []).map((a) => `${a.title} — ${a.urgent ? "log them as spoilage" : "sell these first"}.`).join(" ");
    if (!p || p.need <= 0) return { key: id, name, tone: expiring ? "watch" : "idle", line: `Nothing needed for ${month}`, note: expiring || undefined };
    if (p.shortfall > 0) {
      const waiting = !p.missingBatchSize && p.canMakeNow < p.batches;
      return {
        key: id,
        name,
        tone: "short",
        line: `Need ${p.need} · have ${p.onHand} · ${p.shortfall} short`,
        action: p.missingBatchSize ? "Set its batch size in Settings" : `Make ${pluralize(p.batches, "batch", "batches")} (${p.produced} ${p.unit})`,
        note: [waiting ? `Can't make it yet — waiting on ${p.limitedBy ?? "stock"}.` : "", expiring].filter(Boolean).join(" ") || undefined,
      };
    }
    return { key: id, name, tone: expiring ? "watch" : "ok", line: `Enough · need ${p.need}, have ${p.onHand}`, note: expiring || undefined };
  };

  // Anything to buy that no recipe lists yet (at its restock point) still shows, in its stage.
  const inChain = new Set([...chain.rawMaterials, ...chain.packaging].map((n) => n.id));
  const strays = buying
    .filter((m) => !inChain.has(m.materialId) && (m.toBuy > 0 || m.belowReorderPoint))
    .map((m) => ({ id: m.materialId, name: m.name, feeds: [] as string[] }));
  const byId = new Map(products.map((p) => [p.id, p]));
  const inHouseSet = new Set(chain.inHouse.map((n) => n.id));
  /** Everything one product draws on: its own recipe and, through its in-house parts, theirs. */
  const pathOf = (id: string) => {
    const materials = new Set<string>();
    const parts = new Set<string>();
    const walk = (pid: string, depth: number) => {
      const p = byId.get(pid);
      if (!p || depth > 6) return;
      for (const r of p.recipeIngredients) materials.add(r.materialId);
      for (const c of p.recipeComponents ?? []) {
        if (parts.has(c.productId)) continue;
        parts.add(c.productId);
        walk(c.productId, depth + 1);
      }
    };
    walk(id, 0);
    return { materials, parts };
  };
  // Two products sharing a name get a number, everywhere they're named, so they can be told apart.
  const seen = new Map<string, number>();
  const labelOf = new Map(
    [...chain.products, ...chain.inHouse].map((n) => {
      const k = (seen.get(n.name) ?? 0) + 1;
      seen.set(n.name, k);
      return [n.id, k > 1 ? `${n.name} (${k})` : n.name];
    }),
  );
  const nameOf = (id: string, fallback: string) => labelOf.get(id) ?? fallback;
  const toneRank: Record<FlowTone, number> = { short: 0, watch: 1, ok: 2, idle: 3 };
  const byTone = (a: FlowItem, b: FlowItem) => toneRank[a.tone] - toneRank[b.tone];

  /** The flowchart for every product at once, or for one product's path through it. */
  const stagesFor = (id: string | null): FlowStage[] => {
    const path = id ? pathOf(id) : null;
    const keepMaterial = (mid: string) => !path || path.materials.has(mid);
    const keepPart = (pid: string) => !path || path.parts.has(pid) || pid === id;
    // An in-house item's path runs on into the products that use it.
    const keepSold = (pid: string) => !id || pid === id || (inHouseSet.has(id) && pathOf(pid).parts.has(id));
    // Seen from one product, a material others use too shows the total for all of them.
    const shared = (feeds: string[]) => !!id && feeds.length > 1;
    // A product not being made this month isn't short of anything, even where others are.
    const making = !id || (productPlan.get(id)?.batches ?? 0) > 0;
    const notForThis = (it: FlowItem): FlowItem =>
      making || it.tone !== "short" ? it : { key: it.key, name: it.name, tone: "idle", line: `Short for other products — ${nameOf(id!, "this one")} isn't being made for ${month}` };
    const materials = (nodes: { id: string; name: string; feeds: string[] }[]) =>
      nodes
        .filter((n) => keepMaterial(n.id))
        .map((n) => notForThis(materialItem(n.id, n.name, shared(n.feeds))))
        .sort(byTone);
    return [
      {
        key: "raw",
        id: "what-to-buy",
        icon: <Sprout className="h-4 w-4" />,
        title: "Raw materials",
        items: materials([...chain.rawMaterials, ...(id ? [] : strays.filter((m) => !packagingIds.has(m.id)))]),
        empty: id ? "This product doesn't use any raw materials." : "No recipe uses an ingredient yet — add them in Costing.",
      },
      {
        key: "inhouse",
        icon: <Factory className="h-4 w-4" />,
        title: "Made in-house",
        items: chain.inHouse.filter((n) => keepPart(n.id)).map((n) => productItem(n.id, nameOf(n.id, n.name))).sort(byTone),
        empty: id ? "Nothing made in-house goes into this product." : "Nothing is made here to go into another product yet.",
      },
      {
        key: "sold",
        id: "what-to-make",
        icon: <Package className="h-4 w-4" />,
        title: "Finished products",
        featured: true,
        items: chain.products.filter((n) => keepSold(n.id)).map((n) => productItem(n.id, nameOf(n.id, n.name))).sort(byTone),
        empty: "No products yet.",
      },
      {
        key: "pack",
        icon: <ShoppingCart className="h-4 w-4" />,
        title: "Packaging",
        items: materials([...chain.packaging, ...(id ? [] : strays.filter((m) => packagingIds.has(m.id)))]),
        empty: id ? "This product doesn't use any packaging." : "No recipe uses packaging yet — add it in Costing.",
      },
    ];
  };
  const shortIn = (st: FlowStage[]) => st.reduce((t, x) => t + x.items.filter((i) => i.tone === "short").length, 0);

  // One chip per product, the ones with something short first.
  const chips = [...chain.products, ...chain.inHouse]
    .map((n) => {
      const need = productPlan.get(n.id)?.need ?? 0;
      const short = shortIn(stagesFor(n.id));
      return { id: n.id, label: nameOf(n.id, n.name), tone: (short ? "short" : need > 0 ? "ok" : "idle") as FlowTone, short };
    })
    .sort((a, b) => toneRank[a.tone] - toneRank[b.tone]);

  const [picked, setPicked] = useState<string | null>(null);
  const [showAllDemand, setShowAllDemand] = useState(false);
  const [showMonths, setShowMonths] = useState(false);
  const pickedChip = chips.find((c) => c.id === picked);
  /** Steps through "All products", then each product, and round again. */
  const stepProduct = (dir: 1 | -1) => {
    const order = [null, ...chips.map((c) => c.id)];
    const at = Math.max(0, order.indexOf(pickedChip?.id ?? null));
    setPicked(order[(at + dir + order.length) % order.length]);
  };
  const stages = stagesFor(pickedChip ? pickedChip.id : null);
  const shortCount = shortIn(stagesFor(null));


  // Until the shop's records arrive every stage reads as covered, which is the one wrong answer
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
    <>
      {/* ── The demand projection: everything below follows from it ── */}
      <Panel
        title={`What ${month} needs`}
        note={`How many of each product you should have for ${month}: your usual sales plus planned events. Every step below is checked against this.`}
      >
        {demandRows.length === 0 ? (
          <p className="text-[13.5px] text-muted-foreground">
            No sales expected for {month} yet. Log a few sales or plan an event, and this fills in on its own.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {(showAllDemand ? demandRows : demandRows.filter((p, i) => p.shortfall > 0 || i < DEMAND_ROWS)).map((p) => {
              const short = p.shortfall > 0;
              const covered = Math.min(100, (p.onHand / p.need) * 100);
              // The missing part is drawn at a readable width even when it's 1 jar in 100 — a
              // sliver at the end of a long bar is exactly the shortage nobody notices. The
              // numbers beside it give the real size.
              const gap = short ? Math.max(8, 100 - covered) : 0;
              // Only the usual-sales part is a guess; an event's number is what was planned.
              const rough = (usual.get(p.productId) ?? 0) > 0 && (guess.get(p.productId) === "low" || guess.get(p.productId) === "none");
              return (
                <li key={p.productId}>
                  <div className="flex items-baseline justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onPickProduct?.(p.productId)}
                      title="Edit this product"
                      className="min-w-0 text-left text-[14.5px] font-semibold decoration-cacao/40 underline-offset-2 hover:underline"
                    >
                      {p.name}
                    </button>
                    <span className="shrink-0 text-[14.5px] tabular-nums">
                      <b>{p.onHand}</b>
                      <span className="text-muted-foreground">
                        {" "}
                        / {p.need} {p.unit}
                      </span>
                    </span>
                  </div>
                  {/* One bar: what's on the shelf, then what's missing in red, with the label for
                      the missing part right under it. */}
                  <div
                    className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-track"
                    role="img"
                    aria-label={`${p.onHand} of ${p.need} on the shelf${short ? `, ${p.shortfall} short` : ""}`}
                  >
                    {p.onHand > 0 && <div className={short ? "bg-cacao" : "bg-success"} style={{ width: `${short ? 100 - gap : covered}%` }} />}
                    {short && <div className={`bg-danger ${p.onHand > 0 ? "border-l-2 border-card" : ""}`} style={{ width: `${gap}%` }} />}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-3 text-[12.5px]">
                    <span className="min-w-0 text-muted-foreground">
                      {whyNeeded(p) || "Expected sales"}
                      {rough && " · a rough guess until there are more sales"}
                    </span>
                    {short ? (
                      <span className="shrink-0 font-semibold text-danger">{p.shortfall} short</span>
                    ) : (
                      <span className="shrink-0 font-semibold text-success">Covered</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {demandRows.filter((p, i) => p.shortfall > 0 || i < DEMAND_ROWS).length < demandRows.length && (
          <button
            type="button"
            onClick={() => setShowAllDemand((v) => !v)}
            className="mt-3 text-[13px] font-semibold text-cacao underline-offset-2 hover:underline"
          >
            {showAllDemand ? "Show fewer" : `Show all ${demandRows.length} products`}
          </button>
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

      <div className="-my-2 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-muted-foreground" aria-hidden>
        <ArrowDown className="h-4 w-4" />
        Checked against this, step by step
      </div>

      {/* ── How it's made — and, at every step, whether there's enough ── */}
      <Panel
        title="How it's made — is anything short?"
        note={
          pickedChip
            ? `Just ${pickedChip.label}'s path. Materials it shares with other products show the total for all of them.`
            : `From raw materials to the packed jar, for every product. A step goes red when something in it won't cover ${month}, and says what to do.`
        }
        aside={
          <Pill tone={shortCount ? "bad" : "good"}>{shortCount ? `${pluralize(shortCount, "thing")} short` : "Everything's covered"}</Pill>
        }
      >
        {/* One product at a time, the way Transactions steps through kinds: all of them, then
            each in turn, those with something short first. */}
        {chips.length > 1 && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <CarouselNav
              wrap
              label={pickedChip ? `${pickedChip.label}${pickedChip.short ? ` · ${pickedChip.short} short` : ""}` : "All products"}
              labelWidth="min-w-[220px]"
              onPrev={() => stepProduct(-1)}
              onNext={() => stepProduct(1)}
              prevLabel="Previous product"
              nextLabel="Next product"
            />
            <span className="text-[12.5px] text-muted-foreground">
              {pickedChip
                ? `${chips.findIndex((c) => c.id === pickedChip.id) + 1} of ${chips.length} products`
                : `${pluralize(chips.length, "product")} · use the arrows to see one at a time`}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 min-[1100px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.4fr)_auto_minmax(0,1fr)] min-[1100px]:gap-3">
          {stages.map((st, i) => (
            <Fragment key={st.key}>
              {i > 0 && <Arrow />}
              <FlowStageCard key={`${st.key}-${pickedChip?.id ?? "all"}`} stage={st} />
            </Fragment>
          ))}
        </div>

        {buyTotal > 0 && (
          <p className="mt-4 border-t border-line/10 pt-3 text-[13px] text-muted-foreground">
            Buying what&apos;s short comes to about <b className="text-foreground">{formatPeso(buyTotal)}</b>
            {unpricedBuys.length > 0 && `, not counting ${unpricedBuys.map((m) => m.name).join(", ")} (no price yet)`}.
          </p>
        )}
      </Panel>

    </>
  );
}

type FlowTone = "ok" | "short" | "watch" | "idle";

/** How many items a stage shows before the covered ones fold away. */
const FOLD_AFTER = 4;
/** How many products the demand list shows (besides any that are short) before "Show all". */
const DEMAND_ROWS = 5;

interface FlowItem {
  key: string;
  name: string;
  tone: FlowTone;
  /** Where it stands, in a few words. */
  line: string;
  /** What to do about a shortfall, and what it costs. */
  action?: string;
  aside?: string;
  note?: string;
}

interface FlowStage {
  key: string;
  id?: string;
  icon: React.ReactNode;
  title: string;
  items: FlowItem[];
  empty: string;
  /** The stage the whole chart leads to — finished products — drawn to stand out. */
  featured?: boolean;
}

/** One stage of the flowchart: red when anything in it is short, green when it's all covered. */
function FlowStageCard({ stage }: { stage: FlowStage }) {
  const [open, setOpen] = useState(false);
  const featured = !!stage.featured;
  const short = stage.items.filter((i) => i.tone === "short").length;
  // With many products a stage would be a wall of "enough"s. Whatever needs doing always shows;
  // past a few, the fine ones fold into one line.
  const urgent = stage.items.filter((i) => i.tone === "short" || i.tone === "watch");
  const fine = stage.items.filter((i) => i.tone === "ok" || i.tone === "idle");
  const room = Math.max(0, FOLD_AFTER - urgent.length);
  const folded = open || fine.length <= room + 1 ? [] : fine.slice(room);
  const shown = [...urgent, ...fine.slice(0, fine.length - folded.length)];
  const watch = stage.items.some((i) => i.tone === "watch");
  const used = stage.items.some((i) => i.tone !== "idle");
  const tone: FlowTone = short ? "short" : watch ? "watch" : used ? "ok" : "idle";
  // Finished products are what everything else is for, so that stage gets more room and larger
  // names; its border follows its status like every other stage's.
  const ring = { short: "border-danger/40 bg-danger/[0.04]", watch: "border-[var(--status-warning)]/40 bg-secondary/40", ok: "border-success/30 bg-secondary/40", idle: "border-line/10 bg-secondary/30" }[tone];
  const badge = (
    {
      short: { text: `${short} short`, tone: "bad" },
      watch: { text: "Running low", tone: "warn" },
      ok: { text: "All good", tone: "good" },
      idle: { text: "Nothing needed", tone: "neutral" },
    } as const
  )[tone];

  return (
    <section id={stage.id} className={`min-w-0 scroll-mt-24 rounded-xl border ${stage.featured ? "p-3.5" : "p-3"} ${ring}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p
          className={`flex items-center gap-1.5 whitespace-nowrap font-bold uppercase tracking-wide ${stage.featured ? "text-[13px] text-cacao" : "text-[12px] text-muted-foreground"}`}
        >
          {stage.icon}
          {stage.title}
        </p>
        <Pill tone={badge.tone}>{badge.text}</Pill>
      </div>
      {stage.items.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">{stage.empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((it) => (
            <li key={it.key} className={`rounded-lg bg-card px-2.5 py-2 ${it.tone === "idle" ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <span className={`min-w-0 font-medium ${featured ? "text-[14.5px] font-semibold" : "text-[13.5px]"}`}>{it.name}</span>
                {it.tone === "ok" && <Check2 className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={3} aria-label="Enough" />}
                {it.tone === "short" && <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label="Short" />}
                {it.tone === "watch" && <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-warning)]" aria-label="Running low" />}
              </div>
              <p className="text-[12px] text-muted-foreground">{it.line}</p>
              {it.action && (
                <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2 rounded-md bg-danger/10 px-2 py-1 text-[12.5px] font-semibold text-danger">
                  <span>→ {it.action}</span>
                  {it.aside && <span className="font-normal text-muted-foreground">{it.aside}</span>}
                </div>
              )}
              {it.note && <p className={`mt-1 text-[12px] font-semibold ${it.tone === "short" ? "text-danger" : "text-[var(--status-warning)]"}`}>{it.note}</p>}
            </li>
          ))}
          {folded.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="w-full rounded-lg border border-dashed border-line/25 px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-muted-foreground hover:border-cacao/50 hover:text-cacao"
              >
                + {folded.length} more, all fine
              </button>
            </li>
          )}
          {open && fine.length > room + 1 && (
            <li>
              <button type="button" onClick={() => setOpen(false)} className="px-1 text-[12.5px] font-semibold text-muted-foreground hover:text-cacao">
                Show fewer
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
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
      <div className={`mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 ${flush ? "px-5 pt-4" : ""}`}>
        <div className="min-w-0">
          <h3 className="font-display text-[17px] font-semibold">{title}</h3>
          {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function fmt(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

/** Between two stages: pointing down when they're stacked, across when they're side by side. */
function Arrow() {
  return (
    <div className="flex items-center justify-center text-muted-foreground" aria-hidden>
      <ArrowDown className="h-5 w-5 min-[1100px]:hidden" />
      <ArrowRight className="hidden h-5 w-5 min-[1100px]:block" />
    </div>
  );
}
