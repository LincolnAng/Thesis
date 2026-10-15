"use client";

import { useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { formatPeso, pluralize } from "@/lib/format";
import type { CostLine } from "@/lib/summary/cost-engine";
import type { ProductCostBreakdown } from "@/lib/summary/recipe-cost";
import type { Product } from "@/lib/store/types";
import { perUnit, unitsPerBatch } from "@/lib/costing/per-unit";

/**
 * The Cost tab: what one costs to make, built up in the order it is made —
 *
 *   Bought ingredients  ₱18   → so far ₱18
 *   Made by you         ₱12   → so far ₱30
 *   Your time           ₱7    → so far ₱37
 *   Packaging           ₱8    → ₱45 to make one jar
 *
 * Everything is per unit, since batches vary in size (see lib/costing/per-unit). Each stage opens
 * to its lines: how much goes into one, at what price, and where that price came from. Below it,
 * a small planner: make this many, and what it costs and needs.
 */

const SOURCE: Record<CostLine["source"], [string, string]> = {
  transactions: ["from your receipts", "bg-success/10 text-success"],
  supplier: ["supplier price", "bg-cacao/10 text-cacao"],
  stored: ["typed in", "bg-secondary text-muted-foreground"],
  none: ["no price yet", "bg-danger/10 text-danger"],
};

const IN_HOUSE = " (made in-house)";

export function CostBuildUp({ product, cost, unit }: { product: Product; cost: ProductCostBreakdown; unit: string }) {
  const each = (batch: number) => batch / unitsPerBatch(product);

  const bought = cost.ingredientLines.filter((l) => !l.name.endsWith(IN_HOUSE));
  const made = cost.ingredientLines.filter((l) => l.name.endsWith(IN_HOUSE)).map((l) => ({ ...l, name: l.name.slice(0, -IN_HOUSE.length) }));
  const sum = (lines: CostLine[]) => lines.reduce((s, l) => s + l.batchCost, 0);

  const stages: { title: string; batch: number; lines?: CostLine[]; note?: string }[] = [
    { title: "Bought ingredients", batch: sum(bought), lines: bought },
    ...(made.length > 0 ? [{ title: "Made by you", batch: sum(made), lines: made }] : []),
    {
      title: "Your time",
      batch: cost.laborTotal,
      note: cost.laborTotal > 0 ? (cost.laborIsOverride ? "A peso amount you typed in." : `Minutes per ${unit}, at your hourly rate.`) : "Counted as ₱0 — set it under Your time in the Recipe tab.",
    },
    ...(cost.miscTotal > 0 ? [{ title: "Other costs", batch: cost.miscTotal, note: "Entered before costing went per unit." }] : []),
    { title: "Packaging", batch: cost.packagingTotal, lines: cost.packagingLines },
  ];
  const soFar = stages.map((_, i) => stages.slice(0, i + 1).reduce((t, x) => t + x.batch, 0));

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col rounded-xl border border-line/15">
        {stages.map((s, i) => (
          <Stage
            key={s.title}
            n={i + 1}
            title={s.title}
            amount={formatPeso(each(s.batch))}
            soFar={i > 0 && i < stages.length - 1 ? formatPeso(each(soFar[i])) : null}
            lines={s.lines}
            note={s.note}
            each={each}
          />
        ))}
        <li className="flex items-baseline justify-between gap-3 border-t-2 border-line/20 bg-secondary/40 px-4 py-3">
          <span className="text-[14px] font-semibold">Cost to make one {unit}</span>
          {cost.unpriced.length === 0 ? (
            <span className="font-display text-[22px] font-bold tabular-nums">{formatPeso(each(cost.batchTotal))}</span>
          ) : (
            <span className="text-right">
              <span className="block text-[15px] font-semibold text-muted-foreground">Not known yet</span>
              <span className="block text-[12px] text-muted-foreground">
                {formatPeso(each(cost.batchTotal))} so far — no price for {cost.unpriced.join(", ")}
              </span>
            </span>
          )}
        </li>
      </ol>
      {cost.unconvertible.length > 0 && (
        <p className="text-[12.5px] text-danger">Couldn&apos;t price {cost.unconvertible.join(", ")} — check the units on those lines. The total is missing them.</p>
      )}
      <BatchPlanner product={product} cost={cost} unit={unit} />
    </div>
  );
}

function Stage({
  n,
  title,
  amount,
  soFar,
  lines,
  note,
  each,
}: {
  n: number;
  title: string;
  amount: string;
  soFar: string | null;
  lines?: CostLine[];
  note?: string;
  each: (batch: number) => number;
}) {
  const [open, setOpen] = useState(false);
  const canOpen = (lines?.length ?? 0) > 0;
  return (
    <li className="border-t border-line/10 first:border-t-0">
      <button
        type="button"
        onClick={() => canOpen && setOpen((v) => !v)}
        aria-expanded={canOpen ? open : undefined}
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${canOpen ? "hover:bg-secondary/40" : "cursor-default"}`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[12px] font-bold text-muted-foreground">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium">{title}</span>
          <span className="block text-[12px] text-muted-foreground">{lines ? (lines.length === 0 ? "None in the recipe" : pluralize(lines.length, "item")) : note}</span>
        </span>
        <span className="text-right">
          <span className="block text-[14px] font-semibold tabular-nums">{amount}</span>
          {soFar && <span className="block text-[11.5px] text-muted-foreground tabular-nums">so far {soFar}</span>}
        </span>
        {canOpen && <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && lines && (
        <ul className="flex flex-col gap-1 px-4 pb-3 pl-[52px]">
          {lines.map((l) => (
            <li key={l.materialId} className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{l.name}</span>
                <span className="text-muted-foreground">
                  {Math.round(each(l.quantityPerBatch) * 10000) / 10000} {l.unit} × {formatPeso(l.unitCost)}
                </span>
                <span className={`rounded-full px-1.5 text-[10.5px] font-semibold ${SOURCE[l.source][1]}`}>{SOURCE[l.source][0]}</span>
              </span>
              <span className="tabular-nums">{formatPeso(each(l.batchCost))}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Making a run of N: what it costs in all, and what you'd run short of. */
function BatchPlanner({ product, cost, unit }: { product: Product; cost: ProductCostBreakdown; unit: string }) {
  const { rawMaterials } = useStore();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(String(product.batchYield > 0 ? product.batchYield : 20));
  const n = Math.max(0, Number(count) || 0);
  const short = product.recipeIngredients
    .map((r) => {
      const m = rawMaterials.find((x) => x.id === r.materialId);
      if (!m) return null;
      const need = Math.round(perUnit(product, r.quantity) * n * 100) / 100;
      const gap = Math.round((need - m.qty) * 100) / 100;
      return gap > 0 ? { name: m.name, unit: m.unit, have: m.qty, need, gap } : null;
    })
    .filter((x) => x !== null);

  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-1 text-[13px] font-semibold text-cacao">
        Planning to make a batch?
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl bg-secondary/50 p-3 text-[14px]">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Fewer" onClick={() => setCount(String(Math.max(1, n - 1)))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line/20 bg-card">
              <Minus className="h-4 w-4" />
            </button>
            <input
              inputMode="numeric"
              aria-label={`How many to make`}
              value={count}
              onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-9 w-16 rounded-lg border border-input bg-card text-center font-semibold tabular-nums"
            />
            <button type="button" aria-label="More" onClick={() => setCount(String(n + 1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line/20 bg-card">
              <Plus className="h-4 w-4" />
            </button>
            <span className="text-muted-foreground">{pluralize(n, unit).replace(/^\S+\s/, "")}</span>
          </div>
          <p>
            {pluralize(n, unit)} cost <span className="font-semibold">{formatPeso((cost.batchTotal / unitsPerBatch(product)) * n)}</span> to make
            {cost.unpriced.length > 0 ? " so far — some ingredients have no price yet" : ""}.
          </p>
          {short.map((s) => (
            <p key={s.name} className="text-[13px] text-danger">
              Not enough {s.name} — you have {s.have} {s.unit}, need {s.need} ({s.gap} {s.unit} short).
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
