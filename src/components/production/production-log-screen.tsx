"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Pencil, Trash2 } from "lucide-react";
import { Page } from "@/components/layout/page";
import { BUTTON, toggleButton } from "@/components/ui/kit";
import { CarouselNav } from "@/components/ui/carousel-nav";
import { ActionIcon } from "@/components/transactions/transaction-table";
import { RunDialog } from "@/components/production/run-dialog";
import { CacaoBucket } from "@/components/production/cacao-bucket";
import { useStore } from "@/lib/store/use-store";
import { deleteProductionRun } from "@/lib/store/store";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { cacaoUtilizationPct } from "@/lib/summary/business-config";
import { formatDate } from "@/lib/format";
import { fullName } from "@/lib/summary/product-sizes";
import { findProduct } from "@/lib/summary/product-match";
import { batchesOf, newestFirst, packagingUsed, runTotals } from "@/lib/production/runs";
import type { Entry, ProductionRun } from "@/lib/store/types";

const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};
/** An entry's month on this device's calendar — the timestamp is stored in UTC. */
const entryMonth = (e: Entry) => monthOf(new Date(e.timestamp));

function Step({ label, value, unit, note, tone }: { label: string; value: number; unit: string; note?: string; tone?: "brand" }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-line/15 bg-card px-4 py-3.5">
      <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
      <span className={`mt-1 font-display text-[26px] font-semibold leading-tight tabular-nums ${tone === "brand" ? "text-cacao" : ""}`}>
        {value} <span className="text-[15px] text-muted-foreground">{unit}</span>
      </span>
      {note && <span className="mt-0.5 text-[12px] text-muted-foreground">{note}</span>}
    </div>
  );
}

/**
 * Production: what was actually made, laid out like Transactions — the month (or all time) and
 * the Log production button at the top, what it added up to, then one row per batch: its name,
 * the raw material put in, what was usable from it, the tablea pellets made from that, the
 * finished products made from the pellets, the pellets left over (into Leftover) and the
 * packaging used. Forecast is what to make next; this
 * is what happened.
 */
export function ProductionLogScreen() {
  const { productionRuns, entries, products, rawMaterials, businessSettings } = useStore();
  const exec = isExecutive(useCurrentUser());
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState<ProductionRun | null>(null);
  const thisMonth = monthOf(new Date());
  // Newest first, as Transactions steps them.
  const months = useMemo(
    () => [...new Set([thisMonth, ...productionRuns.map((r) => r.date.slice(0, 7))])].filter(Boolean).sort().reverse(),
    [productionRuns, thisMonth],
  );
  const [period, setPeriod] = useState<string>(thisMonth);
  const monthIndex = months.indexOf(period);
  const inPeriod = (key: string) => period === "all" || key === period;

  const runs = newestFirst(productionRuns.filter((r) => inPeriod(r.date.slice(0, 7))));
  const totals = runTotals(runs, entries, products);
  const unit = runs[0]?.unit || "kg";
  const utilization = cacaoUtilizationPct(businessSettings) / 100;
  // Every batch in the period, run or not — "how much packaging did we use" means all of it.
  const periodBatches = entries.filter((e) => e.type === "INVENTORY_IN" && (e.quantity ?? 0) > 0 && inPeriod(entryMonth(e)));
  const packaging = packagingUsed(periodBatches, products, rawMaterials, utilization);
  const madeUnits = totals.made.reduce((t, m) => t + m.qty, 0);
  const periodName = period === "all" ? "all time" : period === thisMonth ? "this month" : monthLabel(period);

  return (
    <Page title="Production">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <CarouselNav
            label={period === "all" ? "All time" : monthLabel(period)}
            labelWidth="w-[150px]"
            position={period === "all" || monthIndex < 0 ? undefined : { index: months.length - 1 - monthIndex, count: months.length }}
            onPrev={() => setPeriod(months[monthIndex + 1])}
            onNext={() => setPeriod(months[monthIndex - 1])}
            atStart={period === "all" || monthIndex >= months.length - 1}
            atEnd={period === "all" || monthIndex <= 0}
            prevLabel="Earlier month"
            nextLabel="Later month"
          />
          <button type="button" onClick={() => setPeriod(period === "all" ? months[0] : "all")} className={toggleButton(period === "all")}>
            All time
          </button>
          <button type="button" onClick={() => setLogging(true)} className={BUTTON.primary}>
            + Log production
          </button>
        </div>

        {/* Raw → usable → tablea pellets → products, with what was left over. */}
        <section className="grid grid-cols-2 gap-3 min-[1100px]:flex min-[900px]:items-stretch min-[900px]:gap-2" aria-label="Production summary">
          <Step label="Raw materials in" value={totals.raw} unit={unit} note={`${totals.runs} ${totals.runs === 1 ? "batch" : "batches"}`} />
          <ArrowRight className="hidden h-5 w-5 shrink-0 self-center text-muted-foreground min-[1100px]:block" />
          <Step label="Usable Cacao" value={totals.usable} unit={unit} note={totals.yield === null ? "Nothing put in" : `${Math.round(totals.yield * 100)}% of the raw`} />
          <ArrowRight className="hidden h-5 w-5 shrink-0 self-center text-muted-foreground min-[1100px]:block" />
          <Step label="Tablea pellets" value={totals.pellets} unit={unit} note={totals.usable > 0 ? `${Math.round((totals.pellets / totals.usable) * 100)}% of the usable` : "Made from the usable"} />
          <ArrowRight className="hidden h-5 w-5 shrink-0 self-center text-muted-foreground min-[1100px]:block" />
          <Step
            label="Pellets into products"
            value={totals.intoProducts}
            unit={unit}
            note={`${madeUnits} units made${totals.fromBucket > 0 ? ` · ${totals.fromBucket} ${unit} from Leftover` : ""}`}
            tone="brand"
          />
          <ArrowRight className="hidden h-5 w-5 shrink-0 self-center text-muted-foreground min-[1100px]:block" />
          <Step label="Pellets left over" value={totals.leftover} unit={unit} note="Into Leftover" />
        </section>

        <div className="overflow-hidden rounded-2xl border border-line/15 bg-card">
          <RunTable runs={runs} canChange={exec} onEdit={setEditing} />
          <div className="flex flex-wrap justify-between gap-2 border-t border-line/10 px-4 py-2.5 text-xs text-muted-foreground">
            <span>One row per batch. Packaging comes off its stock; pellets left over go into Leftover below.</span>
            <span>
              Showing {runs.length} {runs.length === 1 ? "batch" : "batches"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 min-[1000px]:grid-cols-[1.4fr_1fr]">
          <CacaoBucket />
          <section className="flex flex-col gap-2 rounded-2xl border border-line/15 bg-card p-5">
            <h2 className="font-display text-[20px] font-semibold">Packaging used</h2>
            {packaging.length === 0 ? (
              <p className="text-[13.5px] text-muted-foreground">No packaging used {periodName}.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-[14px]">
                {packaging.map((p) => (
                  <li key={p.material.id} className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{p.material.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {p.qty} <span className="font-normal text-muted-foreground">{p.material.unit}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-auto text-[12px] text-muted-foreground">Every batch {periodName}.</p>
          </section>
        </div>
      </div>

      {logging && <RunDialog onClose={() => setLogging(false)} />}
      {editing && <RunDialog key={editing.id} existing={editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}

/**
 * One row per batch, in fixed columns like the Transactions table:
 *
 *   Date · Batch name · Lot · Raw materials in · Usable cacao · Tablea pellets · Finished products · Pellets left over · Packaging · Recorded by · Actions
 */
function RunTable({ runs, canChange, onEdit }: { runs: ProductionRun[]; canChange: boolean; onEdit: (r: ProductionRun) => void }) {
  const { entries, products, rawMaterials, businessSettings } = useStore();
  const utilization = cacaoUtilizationPct(businessSettings) / 100;
  const rule = "border-r border-line/15 last:border-r-0";
  const th = `px-3 py-2.5 text-center text-[11px] font-bold uppercase leading-tight tracking-wide text-muted-foreground ${rule}`;
  const td = `px-3 py-3 text-center align-middle ${rule}`;
  const widths = [108, 170, 120, 140, 120, 120, 0, 110, 160, 120, 96];

  if (runs.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-muted-foreground">No batches logged. Use Log production after a batch is made.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1480px] table-fixed border-collapse text-[13px]">
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={w ? { width: w } : undefined} />
          ))}
        </colgroup>
        <thead className="border-b border-line/15 bg-secondary">
          <tr>
            {["Date", "Batch name", "Lot", "Raw materials in", "Usable cacao", "Tablea pellets", "Finished products", "Pellets left over", "Packaging", "Recorded by", "Actions"].map((h) => (
              <th key={h} scope="col" className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const material = rawMaterials.find((m) => m.id === r.materialId);
            const u = r.unit || material?.unit || "kg";
            const batches = batchesOf(entries, new Set([r.id]));
            const packaging = packagingUsed(batches, products, rawMaterials, utilization);
            const productName = (sku: string | null) => {
              const p = findProduct(products, sku);
              return p ? fullName(p, products) : (sku ?? "");
            };
            return (
              <tr key={r.id} className="border-b border-line/20 bg-card">
                <td className={`${td} whitespace-nowrap`}>{formatDate(`${r.date}T00:00:00`)}</td>
                <td className={td} title={r.notes || undefined}>
                  <span className="block break-words font-semibold">{r.name || "—"}</span>
                  {r.notes && <span className="block truncate text-[11.5px] italic text-muted-foreground">{r.notes}</span>}
                </td>
                <td className={`${td} break-words text-muted-foreground`}>{r.lotId}</td>
                <td className={td}>
                  {r.rawQty > 0 ? (
                    <>
                      <span className="block font-semibold tabular-nums">
                        {r.rawQty} {u}
                      </span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">{material?.name ?? "—"}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className={td}>
                  {r.usableQty > 0 ? (
                    <>
                      <span className="block font-semibold tabular-nums">
                        {r.usableQty} {u}
                      </span>
                      <span className="block text-[11.5px] text-muted-foreground">
                        {r.rawQty > 0 ? `${Math.round((r.usableQty / r.rawQty) * 100)}% usable` : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className={td}>
                  {r.pelletsQty > 0 || r.fromBucketQty > 0 ? (
                    <>
                      <span className="block font-semibold tabular-nums">
                        {r.pelletsQty} {u}
                      </span>
                      {r.fromBucketQty > 0 && <span className="block text-[11.5px] text-muted-foreground">+{r.fromBucketQty} from Leftover</span>}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className={`${td} text-left`}>
                  {batches.length === 0 ? (
                    <span className="text-muted-foreground">{r.made || "—"}</span>
                  ) : (
                    batches.map((b) => (
                      <span key={b.id} className="flex justify-between gap-2">
                        <span className="truncate">{productName(b.sku)}</span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {b.quantity} <span className="font-normal text-muted-foreground">{b.unit}</span>
                        </span>
                      </span>
                    ))
                  )}
                  {r.intoProductsQty > 0 && (
                    <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                      {r.intoProductsQty} {u} of pellets went in
                    </span>
                  )}
                </td>
                <td className={`${td} tabular-nums ${r.leftoverQty > 0 ? "font-semibold" : "text-muted-foreground"}`}>
                  {r.leftoverQty > 0 ? `${r.leftoverQty} ${u}` : "—"}
                </td>
                <td className={`${td} text-left text-[12.5px]`}>
                  {packaging.length === 0 ? (
                    <span className="block text-center text-muted-foreground">—</span>
                  ) : (
                    packaging.map((p) => (
                      <span key={p.material.id} className="flex justify-between gap-2">
                        <span className="truncate">{p.material.name}</span>
                        <span className="shrink-0 tabular-nums">{p.qty}</span>
                      </span>
                    ))
                  )}
                </td>
                <td className={td}>
                  <span className="block break-words font-medium">{r.loggedByName || "—"}</span>
                </td>
                <td className="px-2 py-1.5 text-center align-middle">
                  <div className="flex items-start justify-center gap-0.5">
                    <ActionIcon icon={Pencil} label="Edit" title={canChange ? "Change this batch" : "Only an Executive can change a batch"} enabled={canChange} onClick={() => onEdit(r)} />
                    <ActionIcon
                      icon={Trash2}
                      label="Delete"
                      title={canChange ? "Delete this batch" : "Only an Executive can delete a batch"}
                      enabled={canChange}
                      onClick={() => {
                        if (window.confirm(`Delete ${r.name || "this batch"}? The raw materials, the products made and Leftover all go back to how they were.`)) deleteProductionRun(r.id);
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
