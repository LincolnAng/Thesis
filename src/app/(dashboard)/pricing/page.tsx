"use client";

import { useMemo, useState } from "react";
import { Page } from "@/components/layout/page";
import { PricingCalculatorCard } from "@/components/finance/pricing-calculator-card";
import { AddProductDialog } from "@/components/stock/edit-product-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPeso, pluralize } from "@/lib/format";
import { useStore } from "@/lib/store/use-store";
import { updateProduct } from "@/lib/store/store";
import { effectiveProductPrice, productCostPerJar, type ProductCostBreakdown } from "@/lib/summary/recipe-cost";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { MAX_MARGIN_PCT, PRICING_METHODS, pricingModeChange } from "@/lib/summary/pricing-methods";
import { buildPricingRows, PRICING_WINDOW_DAYS } from "@/lib/summary/pricing-reality";
import type { PricingMode, Product } from "@/lib/store/types";

/** Pesos with centavos when there are any (₱57.60), whole otherwise (₱180). */
function peso(n: number) {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? formatPeso(r) : `${r < 0 ? "−" : ""}₱${Math.abs(r).toFixed(2)}`;
}

const METHOD_PROMPTS: Record<PricingMode, string> = {
  manual: "Type the price you want to charge:",
  cost_percent: "Add a markup on top of the cost:",
  margin: "Choose how much of the price is profit:",
  competitive: "What similar products sell for:",
};

/** A number that saves when you leave the field or press Enter — not on every keystroke,
 * so typing "180" is one write to Sheets, not three. */
function CommitNumber({
  value,
  onCommit,
  prefix,
  suffix,
  width = "w-20",
}: {
  value: number;
  onCommit: (n: number) => void;
  prefix?: string;
  suffix?: string;
  width?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit() {
    if (draft === null) return;
    const n = Number(draft);
    if (Number.isFinite(n) && n !== value) onCommit(Math.max(0, n));
    setDraft(null);
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-line/20 bg-white px-2 py-1 focus-within:border-cacao">
      {prefix && <span className="text-[13px] text-muted-foreground">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        value={draft ?? String(Math.round(value * 100) / 100)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        className={`${width} bg-transparent text-[13px] font-semibold outline-none`}
      />
      {suffix && <span className="text-[13px] text-muted-foreground">{suffix}</span>}
    </span>
  );
}

function Step({ n, children, dark }: { n: number; children: React.ReactNode; dark?: boolean }) {
  return (
    <div className="flex gap-3.5">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${dark ? "bg-cacao text-ivory" : "bg-cacao/10 text-cacao"}`}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function CostLines({ cost }: { cost: ProductCostBreakdown }) {
  const lines = [
    ["Ingredients", cost.ingredientPerJar],
    ["Packaging", cost.packagingPerJar],
    ["Labor", cost.laborPerJar],
    ["Other", cost.miscPerJar],
  ] as const;
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5 text-[13px] min-[900px]:grid-cols-4">
      {lines.map(([label, v]) => (
        <div key={label} className="flex justify-between gap-3">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold">{peso(v)}</span>
        </div>
      ))}
    </div>
  );
}

function PricingDetail({ product, cost, actual }: { product: Product; cost: ProductCostBreakdown; actual: { price: number | null; sales: number } }) {
  const [showCosts, setShowCosts] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(false);
  const [showTiers, setShowTiers] = useState(false);
  const price = effectiveProductPrice(product, cost);
  const profit = price - cost.costPerJar;
  const margin = price > 0 ? (profit / price) * 100 : 0;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-5 rounded-2xl border border-line/15 bg-white p-[22px]">
        <div className="font-display text-xl font-semibold">{product.name}</div>

        <Step n={1}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              It costs <span className="font-semibold">{peso(cost.costPerJar)}</span> to make one jar
            </div>
            <div className="flex gap-3 text-xs font-semibold text-cacao">
              <button type="button" onClick={() => setShowCosts((v) => !v)}>
                {showCosts ? "Hide breakdown" : "See breakdown"}
              </button>
              <button type="button" onClick={() => setEditingRecipe(true)}>
                Edit recipe & costs
              </button>
            </div>
          </div>
          {showCosts && <CostLines cost={cost} />}
          {cost.unconvertible.length > 0 && (
            <div className="mt-2 text-xs text-danger">Couldn&apos;t price {cost.unconvertible.join(", ")} — check the units in the recipe.</div>
          )}
        </Step>

        <Step n={2}>
          <div className="flex flex-col gap-3">
            <div className="text-sm">How do you want to set the price?</div>
            <div className="flex w-fit flex-wrap gap-1.5 rounded-[10px] bg-secondary p-1">
              {PRICING_METHODS.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => updateProduct(product.id, pricingModeChange(product, m.mode, price))}
                  className={`rounded-lg px-3.5 py-2 text-[13px] ${product.pricingMode === m.mode ? "bg-white font-semibold shadow-sm" : "font-medium text-muted-foreground"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className="text-muted-foreground">{METHOD_PROMPTS[product.pricingMode]}</span>
              {product.pricingMode === "cost_percent" && (
                <CommitNumber value={product.marginPercent} onCommit={(n) => updateProduct(product.id, { marginPercent: n })} suffix="% markup" width="w-14" />
              )}
              {product.pricingMode === "margin" && (
                <CommitNumber
                  value={product.marginPercent}
                  onCommit={(n) => updateProduct(product.id, { marginPercent: Math.min(n, MAX_MARGIN_PCT) })}
                  suffix="% margin"
                  width="w-14"
                />
              )}
              {product.pricingMode === "competitive" && (
                <CommitNumber value={product.marketPrice} onCommit={(n) => updateProduct(product.id, { marketPrice: n })} prefix="₱" />
              )}
              {product.pricingMode === "manual" && (
                <CommitNumber value={product.standardPrice} onCommit={(n) => updateProduct(product.id, { standardPrice: n })} prefix="₱" />
              )}
            </div>
            {product.pricingMode === "margin" && <div className="text-xs text-muted-foreground">A margin can&apos;t reach 100% — the most is {MAX_MARGIN_PCT}%.</div>}
          </div>
        </Step>

        <Step n={3} dark>
          <div className="grid grid-cols-1 gap-3 min-[700px]:grid-cols-3">
            <div className="rounded-xl bg-cacao/[0.06] px-4 py-3">
              <div className="text-xs font-semibold text-muted-foreground">Selling price</div>
              <div className="font-display text-[26px] font-bold text-cacao">{peso(price)}</div>
            </div>
            <div className="rounded-xl bg-secondary px-4 py-3">
              <div className="text-xs font-semibold text-muted-foreground">You make per jar</div>
              <div className={`font-display text-[26px] font-bold ${profit >= 0 ? "text-success" : "text-danger"}`}>{peso(profit)}</div>
            </div>
            <div className="rounded-xl bg-secondary px-4 py-3">
              <div className="text-xs font-semibold text-muted-foreground">Margin</div>
              <div className={`font-display text-[26px] font-bold ${margin >= 15 ? "text-success" : "text-danger"}`}>{Math.round(margin)}%</div>
            </div>
          </div>
          {actual.price !== null && Math.abs(actual.price - price) >= 1 && (
            <div className="mt-2 text-xs text-muted-foreground">
              Your last {pluralize(actual.sales, "sale")} ({PRICING_WINDOW_DAYS} days) averaged{" "}
              <span className="font-semibold text-foreground">{peso(actual.price)}</span> a jar —{" "}
              {actual.price > price ? "above" : "below"} this price.
            </div>
          )}
        </Step>
      </div>

      <div className="rounded-2xl border border-line/15 bg-white px-[22px] py-4">
        <button type="button" onClick={() => setShowTiers((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold">Other prices</span>
          <span className="text-xs text-muted-foreground">
            Friend {peso(product.friendPrice)} · Wholesale {peso(product.wholesalePrice)}
            <span className="ml-3 font-semibold text-cacao">{showTiers ? "Hide" : "Edit"}</span>
          </span>
        </button>
        {showTiers && (
          <div className="mt-4 grid grid-cols-1 gap-4 text-[13px] min-[600px]:grid-cols-2">
            {(
              [
                ["friendPrice", "Friend price"],
                ["wholesalePrice", "Wholesale price"],
              ] as const
            ).map(([key, label]) => {
              const tierProfit = product[key] - cost.costPerJar;
              return (
                <div key={key} className="flex flex-col gap-1">
                  <span className="text-muted-foreground">{label}</span>
                  <CommitNumber value={product[key]} onCommit={(n) => updateProduct(product.id, { [key]: n })} prefix="₱" />
                  <span className={`text-xs font-semibold ${tierProfit >= 0 ? "text-success" : "text-danger"}`}>
                    {tierProfit >= 0 ? `${peso(tierProfit)} profit a jar` : "Below cost"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editingRecipe && (
        <Dialog open onOpenChange={(o) => !o && setEditingRecipe(false)}>
          <DialogContent className="max-h-[88vh] overflow-y-auto rounded-2xl sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{product.name} — recipe & costs</DialogTitle>
            </DialogHeader>
            <PricingCalculatorCard product={product} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function PricingPage() {
  const { products, entries } = useStore();
  const costCtx = useCostContext();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => buildPricingRows(products, entries, costCtx), [products, entries, costCtx]);
  const selected = products.find((p) => p.id === selectedId) ?? products[0];

  return (
    <Page title="Pricing">
      {products.length === 0 ? (
        <div className="rounded-2xl border border-line/15 bg-white px-6 py-12 text-center text-sm text-muted-foreground">
          No products yet.{" "}
          <button type="button" onClick={() => setAdding(true)} className="font-semibold text-cacao">
            Add your first product
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5 min-[1000px]:flex-row">
          <div className="flex shrink-0 flex-col gap-2.5 min-[1000px]:w-[300px]">
            {products.map((p) => {
              const cost = productCostPerJar(p, costCtx);
              const price = effectiveProductPrice(p, cost);
              const margin = price > 0 ? ((price - cost.costPerJar) / price) * 100 : 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`rounded-xl bg-white px-4 py-3.5 text-left transition ${
                    p.id === selected?.id ? "border border-cacao shadow-sm" : "border border-line/15 hover:border-cacao/40"
                  }`}
                >
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="mt-1.5 flex justify-between text-[13px] text-muted-foreground">
                    <span>{peso(price)} / jar</span>
                    <span className={`font-semibold ${margin >= 15 ? "text-success" : "text-danger"}`}>{Math.round(margin)}% margin</span>
                  </div>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-1.5 rounded-[10px] border border-dashed border-line/30 py-2.5 text-[13px] font-semibold text-muted-foreground hover:border-cacao/40"
            >
              + Add product
            </button>
          </div>

          {selected && (
            <PricingDetail
              key={selected.id}
              product={selected}
              cost={productCostPerJar(selected, costCtx)}
              actual={{
                price: rows.find((r) => r.productId === selected.id)?.actualPrice ?? null,
                sales: rows.find((r) => r.productId === selected.id)?.actualSales ?? 0,
              }}
            />
          )}
        </div>
      )}
      {adding && <AddProductDialog products={products} onClose={() => setAdding(false)} />}
    </Page>
  );
}
