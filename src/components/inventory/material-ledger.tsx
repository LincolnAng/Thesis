"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { updateRawMaterial } from "@/lib/store/store";
import { cacaoUtilizationPct } from "@/lib/summary/business-config";
import { valueMaterial } from "@/lib/summary/ingredient-cost";
import { formatNumber } from "@/lib/format";

/**
 * What the shelf SHOULD hold, according to the receipts and the batches.
 *
 * The on-hand figure is a running balance: purchases add to it, batches take from it. That is
 * fine while every movement is logged, and it has no way of healing when one is not — a batch
 * recorded before this app deducted ingredients, or a sack bought in cash and never entered,
 * is wrong in that number forever, because nothing ever recomputes it.
 *
 * So the ledger figure is worked out independently, from purchases minus what production has
 * eaten, and shown beside the counted one. The gap is the interesting part: it is unlogged
 * buying, unlogged usage, or stock that was already in the room before any of this was
 * recorded. The app cannot tell which, and does not pretend to — it shows the two numbers and
 * lets her say which is right.
 */

export function MaterialLedger() {
  const { rawMaterials, entries, products, businessSettings } = useStore();
  const [justSet, setJustSet] = useState<string | null>(null);
  const utilization = cacaoUtilizationPct(businessSettings) / 100;

  const rows = useMemo(
    () =>
      rawMaterials.map((m) => {
        const v = valueMaterial(entries, products, m, utilization);
        return { material: m, ...v, difference: m.qty - v.remaining };
      }),
    [rawMaterials, entries, products, utilization],
  );

  const everBought = rows.filter((r) => r.purchased > 0);
  if (everBought.length === 0) {
    return (
      <section className="rounded-2xl border border-line/15 bg-white p-5">
        <h2 className="font-display text-[17px] font-semibold">What the receipts say</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          No ingredient purchases logged yet. Log what you buy under Money and this works out what should be left on
          the shelf.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line/15 bg-white p-5">
      <h2 className="font-display text-[17px] font-semibold">What the receipts say</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
        Worked out from what you bought, minus what your batches used. Where it disagrees with the shelf, something
        was bought or used without being written down — or it was already there before you started logging.
      </p>

      <div className="mt-3 grid grid-cols-[minmax(0,1.2fr)_90px_90px_90px_minmax(0,1fr)] items-center gap-3 border-b border-line/10 pb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <span>Ingredient</span>
        <span className="text-right">Bought</span>
        <span className="text-right">Used</span>
        <span className="text-right">Should have</span>
        <span>On the shelf</span>
      </div>

      {everBought.map((r) => {
        const off = Math.abs(r.difference) > Math.max(0.05, r.remaining * 0.02);
        return (
          <div
            key={r.material.id}
            className="grid grid-cols-[minmax(0,1.2fr)_90px_90px_90px_minmax(0,1fr)] items-center gap-3 border-b border-line/10 py-2 text-[13px] last:border-0"
          >
            <span className="truncate font-medium">{r.material.name}</span>
            <span className="text-right tabular-nums text-muted-foreground">
              {`${formatNumber(Math.round(r.purchased * 100) / 100)} ${r.material.unit}`}
            </span>
            <span className="text-right tabular-nums text-muted-foreground">
              {`${formatNumber(Math.round(r.consumed * 100) / 100)} ${r.material.unit}`}
            </span>
            <span className="text-right font-semibold tabular-nums">
              {`${formatNumber(Math.round(r.remaining * 100) / 100)} ${r.material.unit}`}
            </span>

            <span className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums">{`${formatNumber(r.material.qty)} ${r.material.unit}`}</span>
              {off ? (
                <>
                  <span className="flex items-center gap-1 text-[11px] text-[#9A6B12]">
                    <AlertTriangle className="h-3 w-3" />
                    {`${r.difference > 0 ? "+" : "−"}${formatNumber(Math.abs(Math.round(r.difference * 100) / 100))} not accounted for`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      updateRawMaterial(r.material.id, { qty: Math.round(r.remaining * 100) / 100 });
                      setJustSet(r.material.id);
                    }}
                    className="rounded-md border border-cacao/30 px-2 py-0.5 text-[11px] font-semibold text-cacao hover:bg-cacao/[0.06]"
                  >
                    Use the receipts
                  </button>
                </>
              ) : justSet === r.material.id ? (
                <span className="flex items-center gap-1 text-[11px] text-success">
                  <Check className="h-3 w-3" /> matched
                </span>
              ) : (
                <span className="text-[11px] text-success">matches</span>
              )}
            </span>
          </div>
        );
      })}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {`Ingredient costs come from these same receipts — the ones with a price are averaged over what's still on the shelf, oldest sack first. ${
          everBought.filter((r) => r.skipped > 0).length > 0
            ? `${everBought.filter((r) => r.skipped > 0).length} ingredient(s) had purchases in a unit that couldn't be converted, and those were left out.`
            : ""
        }`}
      </p>
    </section>
  );
}
