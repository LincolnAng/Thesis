"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { Page } from "@/components/layout/page";
import { BUTTON } from "@/components/ui/kit";
import { CarouselNav } from "@/components/ui/carousel-nav";
import { AddBatchDialog } from "@/components/production/add-batch-dialog";
import { RunDialog } from "@/components/production/run-dialog";
import { CacaoBucket, dayLabel } from "@/components/production/cacao-bucket";
import { useStore } from "@/lib/store/use-store";
import { deleteProductionRun } from "@/lib/store/store";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { cacaoUtilizationPct } from "@/lib/summary/business-config";
import { fullName } from "@/lib/summary/product-sizes";
import { batchesOf, newestFirst, packagingUsed, runTotals } from "@/lib/production/runs";
import type { Entry, ProductionRun } from "@/lib/store/types";

const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};
/** An entry's month on this device's calendar — the timestamp is stored in UTC. */
const entryMonth = (e: Entry) => monthOf(new Date(e.timestamp));
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

function Step({ label, value, unit, note, tone }: { label: string; value: number; unit: string; note?: string; tone?: "brand" | "muted" }) {
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
 * Production: what was actually made. Each run is raw cacao fed into the roaster, the usable
 * cacao that came out, what it became, and what was left over (into the cacao bucket) — with
 * the packaging the batches used. Forecast is what to make next; this is what happened.
 */
export function ProductionLogScreen() {
  const { productionRuns, entries, products, rawMaterials, businessSettings } = useStore();
  const exec = isExecutive(useCurrentUser());
  const [logging, setLogging] = useState(false);
  const [adding, setAdding] = useState(false);
  const thisMonth = monthOf(new Date());
  const months = useMemo(() => [...new Set([thisMonth, ...productionRuns.map((r) => r.date.slice(0, 7))])].filter(Boolean).sort(), [productionRuns, thisMonth]);
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked && months.includes(picked) ? picked : thisMonth;
  const index = months.indexOf(month);

  const runs = newestFirst(productionRuns.filter((r) => r.date.slice(0, 7) === month));
  const totals = runTotals(runs, entries, products);
  const unit = runs[0]?.unit || rawMaterials.find((m) => m.id === runs[0]?.materialId)?.unit || "kg";
  // Every batch this month, run or not — "how much packaging did we use" means all of it.
  const monthBatches = entries.filter((e) => e.type === "INVENTORY_IN" && (e.quantity ?? 0) > 0 && entryMonth(e) === month);
  const utilization = cacaoUtilizationPct(businessSettings) / 100;
  const packaging = packagingUsed(monthBatches, products, rawMaterials, utilization);
  const nameOf = (id: string) => {
    const p = products.find((x) => x.id === id);
    return p ? fullName(p, products) : "A product no longer listed";
  };
  const madeUnits = totals.made.reduce((t, m) => t + m.qty, 0);

  return (
    <Page
      title="Production"
      right={
        <>
          <button type="button" onClick={() => setAdding(true)} className={BUTTON.secondary}>
            Add batch
          </button>
          <button type="button" onClick={() => setLogging(true)} className={BUTTON.primary}>
            + Log production
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[20px] font-semibold">{month === thisMonth ? "This month" : monthLabel(month)}</h2>
          <CarouselNav
            label={monthLabel(month)}
            onPrev={() => setPicked(months[Math.max(0, index - 1)])}
            onNext={() => setPicked(months[Math.min(months.length - 1, index + 1)])}
            atStart={index <= 0}
            atEnd={index >= months.length - 1}
            labelWidth="w-[150px]"
            position={{ index, count: months.length }}
            prevLabel="Earlier month"
            nextLabel="Later month"
          />
        </div>

        {/* Raw → usable → products, with what was left over. */}
        <div className="grid grid-cols-2 gap-3 min-[900px]:flex min-[900px]:items-stretch min-[900px]:gap-2">
          <Step label="Raw cacao roasted" value={totals.raw} unit={unit} note={`${totals.runs} ${totals.runs === 1 ? "run" : "runs"}`} />
          <ArrowRight className="hidden h-5 w-5 shrink-0 self-center text-muted-foreground min-[900px]:block" />
          <Step label="Usable cacao" value={totals.usable} unit={unit} note={totals.yield === null ? "Nothing roasted" : `${pct(totals.yield)} of the raw`} />
          <ArrowRight className="hidden h-5 w-5 shrink-0 self-center text-muted-foreground min-[900px]:block" />
          <Step label="Into finished products" value={totals.intoProducts} unit={unit} note={`${madeUnits} units made${totals.fromBucket > 0 ? ` · ${totals.fromBucket} ${unit} from the bucket` : ""}`} tone="brand" />
          <ArrowRight className="hidden h-5 w-5 shrink-0 self-center text-muted-foreground min-[900px]:block" />
          <Step label="Left over" value={totals.leftover} unit={unit} note="Into the bucket" />
        </div>

        <div className="grid grid-cols-1 gap-4 min-[1000px]:grid-cols-2">
          <section className="flex flex-col gap-2 rounded-2xl border border-line/15 bg-card p-5">
            <h2 className="font-display text-[20px] font-semibold">Made</h2>
            {totals.made.length === 0 ? (
              <p className="text-[13.5px] text-muted-foreground">Nothing logged yet this month.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-[14px]">
                {totals.made.map((m) => (
                  <li key={m.productId} className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{nameOf(m.productId)}</span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {m.qty} <span className="font-normal text-muted-foreground">{m.unit}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="flex flex-col gap-2 rounded-2xl border border-line/15 bg-card p-5">
            <h2 className="font-display text-[20px] font-semibold">Packaging used</h2>
            {packaging.length === 0 ? (
              <p className="text-[13.5px] text-muted-foreground">No packaging used yet this month.</p>
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
            <p className="mt-auto text-[12px] text-muted-foreground">Every batch this month, logged here or with Add batch.</p>
          </section>
        </div>

        <CacaoBucket />

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-[20px] font-semibold">Runs</h2>
          {runs.length === 0 ? (
            <p className="rounded-2xl border border-line/15 bg-card px-4 py-3 text-[13.5px] text-muted-foreground">
              No runs logged {month === thisMonth ? "this month" : `in ${monthLabel(month)}`}. Use Log production after a roast.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {runs.map((r) => (
                <RunRow key={r.id} run={r} batches={batchesOf(entries, new Set([r.id]))} canDelete={exec} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {logging && <RunDialog onClose={() => setLogging(false)} />}
      {adding && <AddBatchDialog onClose={() => setAdding(false)} />}
    </Page>
  );
}

function RunRow({ run, batches, canDelete }: { run: ProductionRun; batches: Entry[]; canDelete: boolean }) {
  const { products, rawMaterials, businessSettings } = useStore();
  const material = rawMaterials.find((m) => m.id === run.materialId);
  const u = run.unit || material?.unit || "kg";
  const packaging = packagingUsed(batches, products, rawMaterials, cacaoUtilizationPct(businessSettings) / 100);
  const flow = [
    run.rawQty > 0 ? `${run.rawQty} ${u} raw → ${run.usableQty} ${u} usable (${Math.round((run.usableQty / run.rawQty) * 100)}%)` : null,
    run.fromBucketQty > 0 ? `${run.fromBucketQty} ${u} from the bucket` : null,
  ].filter(Boolean);

  return (
    <li className="rounded-2xl border border-line/15 bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[15px] font-semibold">
          {dayLabel(run.date)} <span className="font-normal text-muted-foreground">· {run.lotId}</span>
        </span>
        <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          {run.loggedByName}
          {canDelete && (
            <button
              type="button"
              aria-label="Take back this run"
              title="Take back this run"
              onClick={() =>
                window.confirm("Take this run back? The raw cacao, the products made and the bucket all go back to how they were.") && deleteProductionRun(run.id)
              }
              className="rounded-md p-1 hover:bg-secondary hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
      {flow.length > 0 && <div className="mt-1 text-[13.5px]">{flow.join(" · ")}</div>}
      <div className="mt-0.5 text-[13.5px]">
        {batches.length > 0 ? batches.map((b) => `${b.sku} × ${b.quantity}`).join(", ") : run.made || "No products"}
        {material && (
          <span className="text-muted-foreground">
            {" "}
            · {run.intoProductsQty} {u} into products · <span className={run.leftoverQty > 0 ? "font-semibold text-foreground" : ""}>{run.leftoverQty} {u} left over</span>
          </span>
        )}
      </div>
      {packaging.length > 0 && (
        <div className="mt-0.5 text-[12.5px] text-muted-foreground">Packaging: {packaging.map((p) => `${p.qty} ${p.material.unit} ${p.material.name}`).join(", ")}</div>
      )}
      {run.notes && <div className="mt-0.5 text-[12.5px] italic text-muted-foreground">{run.notes}</div>}
    </li>
  );
}
