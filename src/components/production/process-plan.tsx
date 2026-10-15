"use client";

import { useMemo } from "react";
import { ArrowRight, CircleAlert, Clock, Factory, Package, ShoppingCart, Sprout, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { forecastAll } from "@/lib/summary/forecast";
import { allStandings } from "@/lib/summary/material-stock";
import { productExpiry, sellableBy } from "@/lib/summary/product-lots";
import { rawQuantityNeeded } from "@/lib/summary/cacao";
import { cacaoUtilizationPct, eventPlan, expiringWithinDays, multipliersFor, shelfLifeDays } from "@/lib/summary/business-config";
import { planProduction, processChain, type PlanAlert, type ProcessNode } from "@/lib/production/plan";

/**
 * The whole process on one panel: how cacao becomes tablea and tablea becomes what is sold,
 * then what to make and buy so next month's sales and events are covered — with the reason
 * whenever something can't be made yet. Built from Costing (recipes, batch sizes, what is
 * made from what) and Transactions (what's on the shelf).
 */
export function ProcessPlan() {
  const { products, rawMaterials, entries, events, businessSettings } = useStore();

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

  return (
    <section className="flex flex-col gap-4" aria-labelledby="process-title">
      <h2 id="process-title" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Process and plan · covers next month&apos;s sales and upcoming events
      </h2>

      <div className="rounded-2xl border border-line/15 bg-card p-5">
        <h3 className="text-sm font-semibold">How it&apos;s made</h3>
        <p className="mb-4 text-xs text-muted-foreground">From the recipes in Costing. Add an in-house ingredient to a recipe (tablea in ice cream) to link the stages.</p>
        <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
          <Stage icon={<Sprout className="h-4 w-4" />} title="Raw materials" nodes={chain.rawMaterials} empty="No recipe uses an ingredient yet" />
          <Arrow />
          <Stage icon={<Factory className="h-4 w-4" />} title="Made in-house" nodes={chain.inHouse} empty="Nothing is made to go into another product yet" />
          <Arrow />
          <Stage icon={<Package className="h-4 w-4" />} title="Products sold" nodes={chain.products} empty="No products yet" />
          <Arrow />
          <Stage icon={<ShoppingCart className="h-4 w-4" />} title="Packaging" nodes={chain.packaging} empty="No recipe uses packaging yet" />
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
                  <th className="px-3 py-2 text-left">Can make now</th>
                </tr>
              </thead>
              <tbody>
                {planned.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">
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
                </tr>
              </thead>
              <tbody>
                {buying.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-muted-foreground">
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

function Stage({ icon, title, nodes, empty }: { icon: React.ReactNode; title: string; nodes: ProcessNode[]; empty: string }) {
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
          {nodes.map((n) => (
            <li key={n.id} className="rounded-lg bg-card px-2.5 py-1.5 text-[13px]">
              <div className="font-medium">{n.name}</div>
              {n.feeds.length > 0 && <div className="truncate text-[11.5px] text-muted-foreground">→ {n.feeds.join(", ")}</div>}
            </li>
          ))}
        </ul>
      )}
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
