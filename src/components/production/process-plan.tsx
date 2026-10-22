"use client";

import { familiesOf, fullName, sizeName } from "@/lib/summary/product-sizes";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CarouselNav } from "@/components/ui/carousel-nav";
import { Pill } from "@/components/ui/kit";
import { ArrowDown, ArrowRight, Check as Check2, ChevronDown, Factory, Package, ShoppingCart, Sprout, TriangleAlert, X } from "lucide-react";
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
 * recipe flowchart is just coloured boxes — green enough, red short — and a box's numbers show
 * only once it's clicked.
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
            title: `${lot.qty} ${fullName(p, products)} past their date`,
            detail: `From the batch made ${fmt(lot.madeOn)} — expired ${fmt(lot.expiresOn)}. Log them as spoilage so stock stays true.`,
          });
        } else if (lot.daysLeft <= window) {
          expiringAlerts.push({
            kind: "produce",
            productId: p.id,
            urgent: false,
            title: `${lot.qty} ${fullName(p, products)} expire in ${lot.daysLeft} day${lot.daysLeft === 1 ? "" : "s"}`,
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
  /** The demand for one product family: its sizes' needs added up, and each size on its own. */
  type DemandGroup = { key: string; name: string; unit: string; need: number; onHand: number; shortfall: number; sizes: (typeof plan.products)[number][]; lead: (typeof plan.products)[number] };
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
  // A size is its own product sharing the family's name, so name it the way Costing does —
  // "Classic Cacao Spread · 5 g" — or two sizes read as one product listed twice.
  const labelOf = new Map(products.map((p) => [p.id, fullName(p, products)]));
  const nameOf = (id: string, fallback: string) => labelOf.get(id) ?? fallback;
  // Sizes of one product are shown together under the family's name, each with its own need.
  const families = familiesOf(products);
  const familyOf = new Map(families.flatMap((f) => f.all.map((p) => [p.id, f] as const)));
  const sizeLabelOf = (id: string) => {
    const pr = byId.get(id);
    return pr ? sizeName(pr) : "";
  };
  const demandGroups: DemandGroup[] = [];
  for (const row of demandRows) {
    const fam = familyOf.get(row.productId);
    const key = fam?.head.id ?? row.productId;
    if (demandGroups.some((g) => g.key === key)) continue;
    // Every size of the family, needed or not, so the split is complete.
    const sizes = fam && fam.all.length > 1 ? fam.all.map((m) => productPlan.get(m.id)).filter((x): x is (typeof plan.products)[number] => !!x) : [row];
    const sum = (f: (x: (typeof plan.products)[number]) => number) => sizes.reduce((t, x) => t + f(x), 0);
    demandGroups.push({
      key,
      name: fam && fam.all.length > 1 ? fam.head.name : nameOf(row.productId, row.name),
      unit: row.unit,
      need: sum((x) => x.need),
      onHand: sum((x) => Math.min(x.onHand, x.need)),
      // One size's spare jars can't stand in for another size, so shortfalls add up size by size.
      shortfall: sum((x) => x.shortfall),
      sizes: [...sizes].sort((a, b) => b.need - a.need),
      lead: row,
    });
  }
  demandGroups.sort((a, b) => b.shortfall / Math.max(1, b.need) - a.shortfall / Math.max(1, a.need));
  const toneRank: Record<FlowTone, number> = { short: 0, watch: 1, ok: 2, idle: 3 };
  const byTone = (a: FlowItem, b: FlowItem) => toneRank[a.tone] - toneRank[b.tone];
  /** The products among `nodes`, a family at a time: a product with sizes is one item listing each size. */
  const familyItems = (nodes: { id: string; name: string }[], keep: (id: string) => boolean): FlowItem[] => {
    const done = new Set<string>();
    const items: FlowItem[] = [];
    for (const n of nodes.filter((x) => keep(x.id))) {
      const fam = familyOf.get(n.id);
      if (!fam || fam.all.length < 2) {
        items.push(productItem(n.id, nameOf(n.id, n.name)));
        continue;
      }
      if (done.has(fam.head.id)) continue;
      done.add(fam.head.id);
      const members = fam.all.filter((m) => keep(m.id) && nodes.some((x) => x.id === m.id));
      const sizes = members.map((m) => productItem(m.id, sizeLabelOf(m.id))).sort(byTone);
      const plans = members.map((m) => productPlan.get(m.id)).filter((x): x is (typeof plan.products)[number] => !!x && x.need > 0);
      const need = plans.reduce((t, x) => t + x.need, 0);
      const short = plans.reduce((t, x) => t + x.shortfall, 0);
      const have = plans.reduce((t, x) => t + Math.min(x.onHand, x.need), 0);
      items.push({
        key: fam.head.id,
        name: fam.head.name,
        tone: sizes.reduce<FlowTone>((worst, it) => (toneRank[it.tone] < toneRank[worst] ? it.tone : worst), "idle"),
        line: need > 0 ? `Need ${need} · have ${have}${short ? ` · ${short} short` : ""} · ${pluralize(members.length, "size")}` : `Nothing needed for ${month} · ${pluralize(members.length, "size")}`,
        sizes,
      });
    }
    return items.sort(byTone);
  };

  /** The flowchart for every product at once, or for one product's path through it. */
  const stagesFor = (id: string | null): FlowStage[] => {
    const members = id ? (familyOf.get(id)?.all.map((m) => m.id) ?? [id]) : [];
    const path = id
      ? members.map(pathOf).reduce((a, b) => ({ materials: new Set([...a.materials, ...b.materials]), parts: new Set([...a.parts, ...b.parts]) }))
      : null;
    const keepMaterial = (mid: string) => !path || path.materials.has(mid);
    const keepPart = (pid: string) => !path || path.parts.has(pid) || members.includes(pid);
    // An in-house item's path runs on into the products that use it.
    const keepSold = (pid: string) =>
      !id || members.includes(pid) || members.some((m) => inHouseSet.has(m) && pathOf(pid).parts.has(m));
    // Seen from one product, a material others use too shows the total for all of them.
    const shared = (feeds: string[]) => !!id && feeds.length > 1;
    // A product not being made this month isn't short of anything, even where others are.
    const making = !id || members.some((m) => (productPlan.get(m)?.batches ?? 0) > 0);
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
        items: familyItems(chain.inHouse, keepPart),
        empty: id ? "Nothing made in-house goes into this product." : "Nothing is made here to go into another product yet.",
      },
      {
        key: "sold",
        id: "what-to-make",
        icon: <Package className="h-4 w-4" />,
        title: "Finished products",
        featured: true,
        items: familyItems(chain.products, keepSold),
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

  // One stop per product family (its sizes together), the ones with something short first.
  const chipHeads = [...new Set([...chain.products, ...chain.inHouse].map((n) => familyOf.get(n.id)?.head.id ?? n.id))];
  const chips = chipHeads
    .map((id) => {
      const fam = familyOf.get(id);
      const need = (fam?.all ?? []).reduce((t, m) => t + (productPlan.get(m.id)?.need ?? 0), 0) || (productPlan.get(id)?.need ?? 0);
      const short = shortIn(stagesFor(id));
      const label = fam && fam.all.length > 1 ? fam.head.name : nameOf(id, byId.get(id)?.name ?? "Product");
      return { id, label, tone: (short ? "short" : need > 0 ? "ok" : "idle") as FlowTone, short };
    })
    .sort((a, b) => toneRank[a.tone] - toneRank[b.tone]);

  const [picked, setPicked] = useState<string | null>(null);
  const [showAllDemand, setShowAllDemand] = useState(false);
  const [showMonths, setShowMonths] = useState(false);
  // Stepping from a big view (all products) to a small one (one product) would shrink the page
  // and jolt everything below and the scroll position with it. The chart holds the tallest
  // height it has reached instead; a change of width (a turned tablet) starts that over.
  const flowRef = useRef<HTMLDivElement>(null);
  const [flowMin, setFlowMin] = useState(0);
  useEffect(() => {
    const el = flowRef.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        setFlowMin(0);
        return;
      }
      setFlowMin((m) => Math.max(m, el.offsetHeight));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadedFromServer]);
  const pickedChip = chips.find((c) => c.id === picked);
  /** Steps through "All products", then each product, and round again. */
  const stepProduct = (dir: 1 | -1) => {
    const order = [null, ...chips.map((c) => c.id)];
    const at = Math.max(0, order.indexOf(pickedChip?.id ?? null));
    setPicked(order[(at + dir + order.length) % order.length]);
  };
  const stages = stagesFor(pickedChip ? pickedChip.id : null);
  // The one box whose details are open. Stepping to another product keeps it open if it's there too.
  const [selected, setSelected] = useState<{ stage: string; key: string } | null>(null);
  const selectedItem = (() => {
    if (!selected) return null;
    const st = stages.find((x) => x.key === selected.stage);
    const item = st?.items.find((x) => x.key === selected.key);
    return st && item ? { stage: st.key, title: st.title, item } : null;
  })();
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
        {demandGroups.length === 0 ? (
          <p className="text-[13.5px] text-muted-foreground">
            No sales expected for {month} yet. Log a few sales or plan an event, and this fills in on its own.
          </p>
        ) : (
          <ul className="flex flex-col gap-5">
            {(showAllDemand ? demandGroups : demandGroups.filter((g, i) => g.shortfall > 0 || i < DEMAND_ROWS)).map((g) => {
              const short = g.shortfall > 0;
              const covered = Math.min(100, ((g.need - g.shortfall) / g.need) * 100);
              // The missing part is drawn at a readable width even when it's 1 jar in 100 — a
              // sliver at the end of a long bar is exactly the shortage nobody notices. The
              // numbers beside it give the real size.
              const gap = short ? Math.max(8, 100 - covered) : 0;
              const sized = g.sizes.length > 1;
              // Only the usual-sales part is a guess; an event's number is what was planned.
              const rough = g.sizes.some((x) => (usual.get(x.productId) ?? 0) > 0 && (guess.get(x.productId) === "low" || guess.get(x.productId) === "none"));
              return (
                <li key={g.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onPickProduct?.(g.key)}
                      title="Edit this product"
                      className="min-w-0 text-left text-[14.5px] font-semibold decoration-cacao/40 underline-offset-2 hover:underline"
                    >
                      {g.name}
                    </button>
                    <span className="shrink-0 text-[14.5px] tabular-nums">
                      <b>{g.need - g.shortfall}</b>
                      <span className="text-muted-foreground">
                        {" "}
                        / {g.need} {g.unit}
                      </span>
                    </span>
                  </div>
                  {/* One bar: what's on the shelf, then what's missing in red, with the label for
                      the missing part right under it. */}
                  <div
                    className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-track"
                    role="img"
                    aria-label={`${g.need - g.shortfall} of ${g.need} covered${short ? `, ${g.shortfall} short` : ""}`}
                  >
                    {covered > 0 && <div className={short ? "bg-cacao" : "bg-success"} style={{ width: `${short ? 100 - gap : covered}%` }} />}
                    {short && <div className={`bg-danger ${covered > 0 ? "border-l-2 border-card" : ""}`} style={{ width: `${gap}%` }} />}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-3 text-[12.5px]">
                    <span className="min-w-0 text-muted-foreground">
                      {sized ? `${pluralize(g.sizes.length, "size")} — how much of each is below` : whyNeeded(g.lead) || "Expected sales"}
                      {rough && " · a rough guess until there are more sales"}
                    </span>
                    {short ? (
                      <span className="shrink-0 font-semibold text-danger">{g.shortfall} short</span>
                    ) : (
                      <span className="shrink-0 font-semibold text-success">Covered</span>
                    )}
                  </div>

                  {/* Each size's own share: what it needs, what's on its shelf, and why. */}
                  {sized && (
                    <ul className="mt-2 divide-y divide-line/10 rounded-lg bg-secondary/40 px-3">
                      {g.sizes.map((x) => (
                        <li key={x.productId} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-1.5 text-[12.5px]">
                          <span className="min-w-0">
                            <span className="font-semibold">{sizeLabelOf(x.productId)}</span>
                            <span className="text-muted-foreground"> · {x.need > 0 ? whyNeeded(x) || "expected sales" : `not needed for ${month}`}</span>
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {x.need > 0 ? (
                              <>
                                <span className="text-muted-foreground">
                                  need <b className="text-foreground">{x.need}</b> · have {x.onHand}
                                </span>
                                {x.shortfall > 0 ? (
                                  <span className="ml-2 font-semibold text-danger">{x.shortfall} short</span>
                                ) : (
                                  <span className="ml-2 font-semibold text-success">covered</span>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground">{x.onHand} on the shelf</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {demandGroups.filter((g, i) => g.shortfall > 0 || i < DEMAND_ROWS).length < demandGroups.length && (
          <button
            type="button"
            onClick={() => setShowAllDemand((v) => !v)}
            className="mt-3 text-[13px] font-semibold text-cacao underline-offset-2 hover:underline"
          >
            {showAllDemand ? "Show fewer" : `Show all ${demandGroups.length} products`}
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
            ? `Just ${pickedChip.label}. Shared materials show the total for all products.`
            : `Every product, raw materials to packed jar. Green is enough for ${month}, red is short. Click a box for the details.`
        }
        aside={
          // How what's shown stands, then which product it is. The carousel is last and a fixed
          // width, so its arrows never move under the cursor as the pill beside it changes.
          <div className="flex flex-wrap items-center gap-2 min-[900px]:flex-nowrap">
            {pickedChip ? (
              <Pill tone={pickedChip.short ? "bad" : pickedChip.tone === "ok" ? "good" : "neutral"}>
                {pickedChip.short ? `${pickedChip.short} short` : pickedChip.tone === "ok" ? "All good" : "Nothing needed"}
              </Pill>
            ) : (
              <Pill tone={shortCount ? "bad" : "good"}>{shortCount ? `${pluralize(shortCount, "thing")} short` : "Everything's covered"}</Pill>
            )}
            {chips.length > 1 && (
              <CarouselNav
                wrap
                label={pickedChip ? pickedChip.label : "All products"}
                labelWidth="w-[200px]"
                position={{ index: pickedChip ? chips.findIndex((c) => c.id === pickedChip.id) + 1 : 0, count: chips.length + 1 }}
                onPrev={() => stepProduct(-1)}
                onNext={() => stepProduct(1)}
                prevLabel="Previous product"
                nextLabel="Next product"
              />
            )}
          </div>
        }
      >
        <div ref={flowRef} style={{ minHeight: flowMin || undefined }} className="grid grid-cols-1 content-start gap-2 min-[1100px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.4fr)_auto_minmax(0,1fr)] min-[1100px]:gap-3">
          {stages.map((st, i) => (
            <Fragment key={st.key}>
              {i > 0 && <Arrow />}
              <FlowColumn
                stage={st}
                selected={selectedItem?.stage === st.key ? selectedItem.item.key : null}
                onSelect={(key) => setSelected((cur) => (cur?.stage === st.key && cur.key === key ? null : { stage: st.key, key }))}
              />
            </Fragment>
          ))}
        </div>

        {selectedItem && <FlowDetails item={selectedItem.item} stage={selectedItem.title} onClose={() => setSelected(null)} />}

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
  /** A product with sizes: each size's own need and what to do about it. */
  sizes?: FlowItem[];
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

/** Green for enough (or enough but running low), red for short, grey for not needed this month. */
const NODE_TONE: Record<FlowTone, string> = {
  short: "border-danger/50 bg-danger/10",
  watch: "border-success/45 bg-success/10",
  ok: "border-success/45 bg-success/10",
  idle: "border-line/15 bg-card text-muted-foreground",
};

/** One stage of the flowchart: a column of boxes, one per item, coloured by whether it's enough. */
function FlowColumn({ stage, selected, onSelect }: { stage: FlowStage; selected: string | null; onSelect: (key: string) => void }) {
  return (
    <section id={stage.id} className="min-w-0 scroll-mt-24">
      <p
        className={`mb-2 flex items-center justify-center gap-1.5 whitespace-nowrap font-bold uppercase tracking-wide ${stage.featured ? "text-[13px] text-cacao" : "text-[12px] text-muted-foreground"}`}
      >
        {stage.icon}
        {stage.title}
      </p>
      {stage.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line/20 px-2.5 py-2 text-center text-[12px] text-muted-foreground">{stage.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {stage.items.map((it) => {
            const on = selected === it.key;
            return (
              <li key={it.key}>
                <button
                  type="button"
                  onClick={() => onSelect(it.key)}
                  aria-expanded={on}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:brightness-95 ${NODE_TONE[it.tone]} ${on ? "ring-2 ring-cacao ring-offset-1 ring-offset-card" : ""}`}
                >
                  <span className={`min-w-0 truncate font-semibold ${stage.featured ? "text-[14px]" : "text-[13px]"}`}>{it.name}</span>
                  <ToneIcon tone={it.tone} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ToneIcon({ tone, small }: { tone: FlowTone; small?: boolean }) {
  const size = small ? "h-3.5 w-3.5" : "h-4 w-4";
  if (tone === "short") return <TriangleAlert className={`${size} shrink-0 text-danger`} aria-label="Short" />;
  if (tone === "ok" || tone === "watch") return <Check2 className={`${size} shrink-0 text-success`} strokeWidth={3} aria-label="Enough" />;
  return null;
}

/** What one box in the flowchart stands for, shown under the chart once it's clicked. */
function FlowDetails({ item, stage, onClose }: { item: FlowItem; stage: string; onClose: () => void }) {
  const status = { short: { text: "Short", tone: "bad" }, watch: { text: "Enough, running low", tone: "warn" }, ok: { text: "Enough", tone: "good" }, idle: { text: "Not needed", tone: "neutral" } } as const;
  return (
    <div className="mt-4 rounded-xl border border-line/15 bg-secondary/40 p-4">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">{stage}</p>
          <p className="text-[15px] font-semibold">{item.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Pill tone={status[item.tone].tone}>{status[item.tone].text}</Pill>
          <button type="button" onClick={onClose} aria-label="Close details" className="rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <ItemBody item={item} />
      {item.sizes && (
        <ul className="mt-3 grid gap-2 min-[700px]:grid-cols-2">
          {item.sizes.map((sz) => (
            <li key={sz.key} className={`rounded-lg border px-3 py-2 ${NODE_TONE[sz.tone]}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">{sz.name}</span>
                <ToneIcon tone={sz.tone} small />
              </div>
              <ItemBody item={sz} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemBody({ item }: { item: FlowItem }) {
  return (
    <>
      <p className="text-[12.5px] text-muted-foreground">{item.line}</p>
      {item.action && (
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2 rounded-md bg-danger/10 px-2 py-1 text-[12.5px] font-semibold text-danger">
          <span>→ {item.action}</span>
          {item.aside && <span className="font-normal text-muted-foreground">{item.aside}</span>}
        </div>
      )}
      {item.note && <p className={`mt-1 text-[12px] font-semibold ${item.tone === "short" ? "text-danger" : "text-[var(--status-warning)]"}`}>{item.note}</p>}
    </>
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
