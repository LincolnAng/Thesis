"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, Clock, Factory, Package, ShoppingCart, Sprout, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { forecastAll } from "@/lib/summary/forecast";
import { allStandings } from "@/lib/summary/material-stock";
import { productExpiry, sellableBy } from "@/lib/summary/product-lots";
import { rawQuantityNeeded } from "@/lib/summary/cacao";
import { cacaoUtilizationPct, eventPlan, expiringWithinDays, multipliersFor, shelfLifeDays } from "@/lib/summary/business-config";
import { planProduction, processChain, type PlanAlert, type ProcessNode } from "@/lib/production/plan";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { getUnitCost } from "@/lib/summary/cost-engine";
import { formatPeso } from "@/lib/format";

/**
 * The whole process on one panel: how cacao becomes tablea and tablea becomes what is sold,
 * then what to make and buy so next month's sales and events are covered — with the reason
 * whenever something can't be made yet. Built from Costing (recipes, batch sizes, what is
 * made from what) and Transactions (what's on the shelf).
 *
 * Money runs through all of it: each stage of "How it's made" carries its cost (a kilo of
 * cacao, one tablea, one jar of spread, one lid), the plan says what making and buying it all
 * comes to beside what next month's sales should bring in, and the two tables carry the cost
 * of each run and each purchase.
 */
export function ProcessPlan() {
  const { products, rawMaterials, entries, events, businessSettings } = useStore();
  const costCtx = useCostContext();

  const result = useMemo(() => {
    const now = new Date();
    const utilization = cacaoUtilizationPct(businessSettings) / 100;
    const window = expiringWithinDays(businessSettings);

    // Demand: next month's forecast, plus what upcoming events plan to take.
    const demand = new Map<string, number>();
    for (const f of forecastAll(products, entries, now, (id) => multipliersFor(businessSettings, id))) {
      demand.set(f.productId, f.forecastQty);
    }
    const today = now.toISOString().slice(0, 10);
    for (const e of events.filter((x) => x.status === "open" && (!x.startDate || x.startDate.slice(0, 10) >= today))) {
      for (const [productId, qty] of Object.entries(eventPlan(businessSettings, e.id))) {
        demand.set(productId, (demand.get(productId) ?? 0) + Math.max(0, qty));
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
            urgent: true,
            title: `${lot.qty} ${p.name} past their date`,
            detail: `From the batch made ${fmt(lot.madeOn)} — expired ${fmt(lot.expiresOn)}. Log them as spoilage so stock stays true.`,
          });
        } else if (lot.daysLeft <= window) {
          expiringAlerts.push({
            kind: "produce",
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
    return { plan, chain: processChain(products, materials), expiringAlerts };
  }, [products, rawMaterials, entries, events, businessSettings]);

  const { plan, chain, expiringAlerts } = result;
  const alerts = [...plan.alerts, ...expiringAlerts].sort((a, b) => Number(b.urgent) - Number(a.urgent));
  const planned = plan.products.filter((p) => p.need > 0 || p.batches > 0);
  const buying = plan.materials.filter((m) => m.required > 0 || m.belowReorderPoint);

  // ── Money ──────────────────────────────────────────────────────────────
  const money = useMemo(() => {
    const unitCostOf = (id: string) => getUnitCost(id, costCtx.rawMaterials, costCtx.supplierPrices, costCtx.entries, costCtx.products, costCtx.cacaoUtilization);
    const byProduct = new Map(
      products.map((p) => {
        const cost = productCostPerJar(p, costCtx);
        const hasRecipe = p.recipeIngredients.length > 0 || (p.recipeComponents ?? []).length > 0;
        const known = hasRecipe && p.batchYield > 0 && cost.unpriced.length === 0;
        // What a batch costs apart from things made in-house, which are costed in their own run.
        const inHouse = cost.ingredientLines.filter((l) => products.some((x) => x.id === l.materialId)).reduce((t, l) => t + l.batchCost, 0);
        return [p.id, { known, each: cost.costPerJar, batch: cost.batchTotal, direct: cost.batchTotal - inHouse, price: effectiveProductPrice(p, cost) }];
      }),
    );
    return { unitCostOf, byProduct };
  }, [products, costCtx]);
  const runCost = (productId: string, batches: number) => {
    const c = money.byProduct.get(productId);
    return c?.known ? c.batch * batches : null;
  };
  const buyCost = (materialId: string, qty: number) => {
    const u = money.unitCostOf(materialId);
    return u.source === "none" ? null : u.cost * qty;
  };
  const runs = planned.filter((p) => p.batches > 0);
  const unknownRuns = runs.filter((p) => !money.byProduct.get(p.productId)?.known);
  // In-house items (tablea) are counted in their own run, not again inside what uses them.
  const makeTotal = runs.reduce((t, p) => {
    const c = money.byProduct.get(p.productId);
    return c?.known ? t + c.direct * p.batches : t;
  }, 0);
  const toBuy = buying.filter((m) => m.toBuy > 0);
  const buyTotal = toBuy.reduce((t, m) => t + (buyCost(m.materialId, m.toBuy) ?? 0), 0);
  const unpricedBuys = toBuy.filter((m) => buyCost(m.materialId, m.toBuy) === null);
  const salesValue = plan.products.reduce((t, p) => t + p.demand * (money.byProduct.get(p.productId)?.price ?? 0), 0);

  const perUnitLabel = (unit: string) => (unit ? `/${unit}` : "");
  const costNode = (n: ProcessNode, kind: "material" | "product") => {
    if (kind === "material") {
      const material = rawMaterials.find((m) => m.id === n.id);
      const u = money.unitCostOf(n.id);
      return { ...n, cost: u.source === "none" ? null : `${formatPeso(u.cost)}${perUnitLabel(material?.unit ?? "")}` };
    }
    const c = money.byProduct.get(n.id);
    return {
      ...n,
      href: `/costing?product=${n.id}`,
      cost: c?.known ? `${formatPeso(c.each)} to make` : null,
      sells: c && c.price > 0 ? c.price : null,
      keep: c?.known && c.price > 0 ? c.price - c.each : null,
    };
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="process-title">
      <h2 id="process-title" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Process and plan · covers next month&apos;s sales and upcoming events
      </h2>

      <div className="rounded-2xl border border-line/15 bg-card p-5">
        <h3 className="text-sm font-semibold">How it&apos;s made, and what each step costs</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          From the recipes in Costing. Tap a product to see its recipe and how its cost adds up. Add an in-house ingredient to a recipe (tablea in ice
          cream) to link the stages.
        </p>
        <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
          <Stage icon={<Sprout className="h-4 w-4" />} title="Raw materials" nodes={chain.rawMaterials.map((n) => costNode(n, "material"))} empty="No recipe uses an ingredient yet" />
          <Arrow />
          <Stage icon={<Factory className="h-4 w-4" />} title="Made in-house" nodes={chain.inHouse.map((n) => costNode(n, "product"))} empty="Nothing is made to go into another product yet" />
          <Arrow />
          <Stage icon={<Package className="h-4 w-4" />} title="Products sold" nodes={chain.products.map((n) => costNode(n, "product"))} empty="No products yet" />
          <Arrow />
          <Stage icon={<ShoppingCart className="h-4 w-4" />} title="Packaging" nodes={chain.packaging.map((n) => costNode(n, "material"))} empty="No recipe uses packaging yet" />
        </div>
      </div>

      <div className="rounded-2xl border border-line/15 bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Alerts</h3>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to make or buy — stock covers what&apos;s expected, and no batch is near its date.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 min-[900px]:grid-cols-2">
            {alerts.map((a, i) => (
              <li key={`${a.title}-${i}`} className={`flex gap-2.5 rounded-xl border p-3 ${a.urgent ? "border-danger/35 bg-danger/[0.03]" : "border-line/15"}`}>
                <AlertIcon alert={a} />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold">{a.title}</p>
                  <p className="text-[13px] text-muted-foreground">{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(runs.length > 0 || toBuy.length > 0 || salesValue > 0) && (
        <div className="grid grid-cols-1 gap-3 min-[700px]:grid-cols-3" aria-label="What the plan costs">
          <MoneyFigure
            label="Making it all costs about"
            value={formatPeso(makeTotal)}
            note={
              unknownRuns.length > 0
                ? `Not counting ${unknownRuns.map((p) => p.name).join(", ")} — no cost yet`
                : "Ingredients, packaging, your time and other costs"
            }
          />
          <MoneyFigure
            label="Of that, still to buy"
            value={formatPeso(buyTotal)}
            note={unpricedBuys.length > 0 ? `Not counting ${unpricedBuys.map((m) => m.name).join(", ")} — no price yet` : "What's missing from the shelf"}
          />
          <MoneyFigure label="Next month's sales should bring in" value={formatPeso(salesValue)} note="Expected sales and events, at today's prices" good />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 min-[1500px]:grid-cols-[3fr_2fr]">
        <div id="what-to-make" className="scroll-mt-24 overflow-hidden rounded-2xl border border-line/15 bg-card">
          <div className="px-5 pt-4">
            <h3 className="text-sm font-semibold">What to make</h3>
            <p className="text-xs text-muted-foreground">
              Need = expected sales + what other products use. Made in whole batches, so it always covers the shortfall.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[620px] text-[13px]">
              <thead className="bg-secondary/50 text-[12px] font-semibold text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Need</th>
                  <th className="px-3 py-2 text-right">On hand</th>
                  <th className="px-3 py-2 text-right">Short</th>
                  <th className="px-3 py-2 text-right">Batches</th>
                  <th className="px-3 py-2 text-right">Cost of run</th>
                  <th className="px-3 py-2 text-left">Can make now</th>
                </tr>
              </thead>
              <tbody>
                {planned.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-6 text-center text-muted-foreground">
                      No demand expected yet — sales history and event plans drive this.
                    </td>
                  </tr>
                ) : (
                  planned.map((p) => (
                    <tr key={p.productId} className="border-t border-line/10">
                      <td className="px-5 py-2">
                        <div className="font-medium">{p.name}</div>
                        {p.usedByOthers > 0 && <div className="text-[11.5px] text-muted-foreground">{p.usedByOthers} go into other products</div>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.need}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.onHand}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${p.shortfall > 0 ? "font-semibold text-danger" : ""}`}>{p.shortfall}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.missingBatchSize ? "—" : p.batches ? `${p.batches} (${p.produced})` : "0"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.batches > 0 ? (
                          runCost(p.productId, p.batches) != null ? (
                            formatPeso(runCost(p.productId, p.batches) ?? 0)
                          ) : (
                            <Link href={`/costing?product=${p.productId}`} className="text-[12px] text-[var(--status-warning)] underline decoration-dotted">
                              No cost yet
                            </Link>
                          )
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {p.missingBatchSize ? (
                          <span className="text-[var(--status-warning)]">Set a batch size in Costing</span>
                        ) : p.batches === 0 ? (
                          <span className="text-muted-foreground">Nothing to make</span>
                        ) : p.canMakeNow >= p.batches ? (
                          <span className="font-semibold text-success">All {p.batches}</span>
                        ) : (
                          <span className="font-semibold text-danger">
                            {p.canMakeNow} of {p.batches} · short of {p.limitedBy}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div id="what-to-buy" className="scroll-mt-24 overflow-hidden rounded-2xl border border-line/15 bg-card">
          <div className="px-5 pt-4">
            <h3 className="text-sm font-semibold">What to buy</h3>
            <p className="text-xs text-muted-foreground">Raw materials and packaging the plan draws on.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[420px] text-[13px]">
              <thead className="bg-secondary/50 text-[12px] font-semibold text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left">Material</th>
                  <th className="px-3 py-2 text-right">Needed</th>
                  <th className="px-3 py-2 text-right">On hand</th>
                  <th className="px-3 py-2 text-right">To buy</th>
                  <th className="px-3 py-2 text-right">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {buying.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">
                      Nothing needed yet.
                    </td>
                  </tr>
                ) : (
                  buying.map((m) => (
                    <tr key={m.materialId} className="border-t border-line/10">
                      <td className="px-5 py-2">
                        <div className="font-medium">{m.name}</div>
                        {m.belowReorderPoint && (
                          <div className="text-[11.5px] text-danger">
                            At its restock point ({m.reorderPoint} {m.unit})
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {m.required} {m.unit}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {m.onHand} {m.unit}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${m.toBuy > 0 ? "font-semibold text-danger" : "text-muted-foreground"}`}>
                        {m.toBuy > 0 ? `${m.toBuy} ${m.unit}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {m.toBuy > 0 ? (buyCost(m.materialId, m.toBuy) != null ? formatPeso(buyCost(m.materialId, m.toBuy) ?? 0) : <span className="text-[12px] text-muted-foreground">No price yet</span>) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function fmt(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

type CostedNode = ProcessNode & { cost: string | null; href?: string; sells?: number | null; keep?: number | null };

function Stage({ icon, title, nodes, empty }: { icon: React.ReactNode; title: string; nodes: CostedNode[]; empty: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-secondary/40 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </p>
      {nodes.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {nodes.map((n) => {
            const body = (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{n.name}</span>
                  <span className={`shrink-0 text-[12px] tabular-nums ${n.cost ? "font-semibold" : "text-[var(--status-warning)]"}`}>{n.cost ?? "No cost yet"}</span>
                </div>
                {n.sells != null && (
                  <div className="text-[11.5px] text-muted-foreground">
                    Sells {formatPeso(n.sells)}
                    {n.keep != null && <span className={n.keep >= 0 ? "text-success" : "text-danger"}> · keeps {formatPeso(n.keep)}</span>}
                  </div>
                )}
                {n.feeds.length > 0 && <div className="truncate text-[11.5px] text-muted-foreground">→ {n.feeds.join(", ")}</div>}
              </>
            );
            return (
              <li key={n.id}>
                {n.href ? (
                  <Link href={n.href} className="block rounded-lg bg-card px-2.5 py-1.5 text-[13px] transition hover:ring-1 hover:ring-cacao/40">
                    {body}
                  </Link>
                ) : (
                  <div className="rounded-lg bg-card px-2.5 py-1.5 text-[13px]">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MoneyFigure({ label, value, note, good }: { label: string; value: string; note: string; good?: boolean }) {
  return (
    <div className="rounded-2xl border border-line/15 bg-card px-4 py-3">
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p className={`font-display text-[22px] font-bold tabular-nums ${good ? "text-success" : ""}`}>{value}</p>
      <p className="text-[11.5px] text-muted-foreground">{note}</p>
    </div>
  );
}

function Arrow() {
  return (
    <div className="hidden items-center justify-center text-muted-foreground min-[900px]:flex" aria-hidden>
      <ArrowRight className="h-5 w-5" />
    </div>
  );
}

function AlertIcon({ alert }: { alert: PlanAlert }) {
  const cls = `mt-0.5 h-4 w-4 shrink-0 ${alert.urgent ? "text-danger" : "text-[var(--status-warning)]"}`;
  if (alert.kind === "restock") return <ShoppingCart className={cls} />;
  if (alert.kind === "limited") return <CircleAlert className={cls} />;
  if (alert.kind === "no_batch_size") return <TriangleAlert className={cls} />;
  if (alert.title.includes("expire") || alert.title.includes("past their date")) return <Clock className={cls} />;
  return <Factory className={cls} />;
}
