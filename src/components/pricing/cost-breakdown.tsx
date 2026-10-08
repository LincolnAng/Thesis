"use client";

import { formatPrice } from "@/lib/format";
import type { ProductCostBreakdown } from "@/lib/summary/recipe-cost";
import type { CostLine } from "@/lib/summary/cost-engine";
import type { Product } from "@/lib/store/types";

/**
 * Where the cost of a jar comes from, line by line.
 *
 * It used to be four numbers — ingredients, packaging, labour, other — with no way to see what
 * was inside any of them. So "₱63.25 to make" was a figure to either accept or distrust, and
 * when it moved there was nothing to look at.
 *
 * It matters more now that prices are read from her receipts: the same ingredient can be
 * costed from a purchase she logged, from a supplier price she typed months ago, or from a
 * number somebody guessed at setup. Those are not equally true and the screen should not
 * present them as if they were.
 */

const SOURCE_LABEL: Record<CostLine["source"], string> = {
  transactions: "from your receipts",
  supplier: "supplier price",
  stored: "typed in",
  none: "no price yet",
};

const SOURCE_TONE: Record<CostLine["source"], string> = {
  transactions: "bg-success/10 text-success",
  supplier: "bg-cacao/10 text-cacao",
  stored: "bg-secondary text-muted-foreground",
  none: "bg-danger/10 text-danger",
};

function Lines({ lines, yieldQty }: { lines: CostLine[]; yieldQty: number }) {
  if (lines.length === 0) {
    return <div className="py-1.5 pl-3 text-[12px] text-muted-foreground">Nothing in the recipe yet.</div>;
  }
  return (
    <div className="flex flex-col">
      {lines.map((l) => (
        <div key={l.materialId} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-1 pl-3">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
            <span className="font-medium">{l.name}</span>
            <span className="text-muted-foreground">
              {`${Math.round(l.quantityPerBatch * 100) / 100} ${l.unit} × ${formatPrice(l.unitCost)}`}
            </span>
            <span className={`rounded-full px-1.5 py-[1px] text-[10px] font-semibold ${SOURCE_TONE[l.source]}`}>
              {SOURCE_LABEL[l.source]}
            </span>
          </span>
          <span className="text-right text-[12px] tabular-nums">
            {yieldQty > 0 ? `${formatPrice(l.batchCost / yieldQty)} a jar` : formatPrice(l.batchCost)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Group({
  title,
  perJar,
  children,
}: {
  title: string;
  perJar: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-line/10 py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</span>
        <span className="text-[13px] font-semibold tabular-nums">{`${formatPrice(perJar)} a jar`}</span>
      </div>
      {children}
    </div>
  );
}

export function CostBreakdown({ product, cost }: { product: Product; cost: ProductCostBreakdown }) {
  const yieldQty = product.batchYield;

  return (
    <div className="mt-3 rounded-xl border border-line/15 bg-secondary/30 px-4 py-1">
      <Group title="Ingredients" perJar={cost.ingredientPerJar}>
        <Lines lines={cost.ingredientLines} yieldQty={yieldQty} />
      </Group>

      <Group title="Packaging" perJar={cost.packagingPerJar}>
        <Lines lines={cost.packagingLines} yieldQty={yieldQty} />
      </Group>

      <Group title="Your time" perJar={cost.laborPerJar}>
        <div className="py-1 pl-3 text-[12px] text-muted-foreground">
          {cost.laborPerJar > 0
            ? cost.laborIsOverride
              ? "A figure you typed in for the whole batch."
              : "Minutes per batch at your hourly rate."
            : "Counted as ₱0 — so every margin on this page is better than the real one. Set your rate and minutes under the recipe."}
        </div>
      </Group>

      <Group title="Other" perJar={cost.miscPerJar}>
        <div className="py-1 pl-3 text-[12px] text-muted-foreground">
          {cost.miscPerJar > 0 ? "Gas, electricity and anything else on the recipe." : "Nothing added."}
        </div>
      </Group>

      <div className="flex items-baseline justify-between gap-3 border-t border-line/20 py-2.5">
        <span className="text-[12px] font-bold uppercase tracking-wide">Total</span>
        <span className="font-display text-[17px] font-semibold">{`${formatPrice(cost.costPerJar)} a jar`}</span>
      </div>

      {cost.unconvertible.length > 0 && (
        <p className="pb-2 text-[11px] text-danger">
          {`Couldn't price ${cost.unconvertible.join(", ")} — check the units on those rows. The total above is missing them.`}
        </p>
      )}
    </div>
  );
}
