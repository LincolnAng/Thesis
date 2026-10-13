"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Page, PageTabs } from "@/components/layout/page";
import { PricingCalculatorCard } from "@/components/finance/pricing-calculator-card";
import { AddProductDialog } from "@/components/stock/edit-product-dialog";
import { formatPrice, pluralize } from "@/lib/format";
import { useStore } from "@/lib/store/use-store";
import { updateProduct } from "@/lib/store/store";
import { effectiveProductPrice, productCostPerJar, type ProductCostBreakdown } from "@/lib/summary/recipe-cost";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { MAX_MARGIN_PCT, PRICING_METHODS, pricingModeChange } from "@/lib/summary/pricing-methods";
import { CostBreakdown } from "@/components/pricing/cost-breakdown";
import { buildPricingRows, PRICING_WINDOW_DAYS } from "@/lib/summary/pricing-reality";
import type { PricingMode, Product } from "@/lib/store/types";
import { SimplePrices } from "@/components/simple/simple-prices";
import { useViewMode } from "@/lib/summary/view-mode";

/** Pesos with centavos when there are any (₱57.60), whole otherwise (₱180). */
const peso = formatPrice;

const METHOD_PROMPTS: Record<PricingMode, string> = {
  manual: "Type the price you want to charge:",
  cost_percent: "Add a markup on top of the cost:",
  margin: "Choose how much of the price is profit:",
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
    <span className="inline-flex items-center gap-1 rounded-lg border border-line/20 bg-card px-2 py-1 focus-within:border-cacao">
      {prefix && <span className="text-[13px] text-muted-foreground">{prefix}</span>}
      <input
        type="text"
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

function PricingDetail({ product, cost, actual }: { product: Product; cost: ProductCostBreakdown; actual: { price: number | null; sales: number } }) {
  /**
   * Three jobs, three tabs. The recipe used to open in a dialog over the page and the other
   * rates hid behind a toggle labelled "Edit", so the two things she changes most often were
   * the two hardest to find — and neither could be looked at while the price was on screen.
   */
  const [tab, setTab] = useState<"price" | "recipe" | "rates">("price");
  const price = effectiveProductPrice(product, cost);
  const profit = price - cost.costPerJar;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  // Costing is only as complete as the receipts behind it. With part of the recipe unpriced,
  // the profit and margin below would be arithmetic on a number that is missing pieces.
  const costable = cost.unpriced.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-5 rounded-2xl border border-line/15 bg-card p-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-display text-xl font-semibold">{product.name}</div>
          <PageTabs
            tabs={[
              ["price", "Price"],
              ["recipe", "Recipe & costs"],
              ["rates", "Other rates"],
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>

        {tab === "recipe" && (
          <div className="flex flex-col gap-4">
            <CostBreakdown product={product} cost={cost} />
            {cost.unconvertible.length > 0 && (
              <div className="text-xs text-danger">
                {`Couldn't price ${cost.unconvertible.join(", ")} — check the units in the recipe.`}
              </div>
            )}
            <PricingCalculatorCard product={product} />
          </div>
        )}

        {tab === "rates" && (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-muted-foreground">
              What you charge people who aren&apos;t walk-up buyers. Each one is checked against what the jar costs you,
              so a friendly price stays a discount rather than a loss.
            </p>
            <div className="grid grid-cols-1 gap-4 text-[13px] min-[600px]:grid-cols-2">
              {(
                [
                  ["friendPrice", "Friend price", "Family, neighbours, regulars who buy direct."],
                  ["wholesalePrice", "Wholesale price", "Shops and resellers buying in bulk."],
                ] as const
              ).map(([key, label, hint]) => {
                const tierProfit = product[key] - cost.costPerJar;
                const below = product[key] < price;
                return (
                  <div key={key} className="flex flex-col gap-1.5 rounded-xl border border-line/15 p-4">
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-xs text-muted-foreground">{hint}</span>
                    <CommitNumber value={product[key]} onCommit={(n) => updateProduct(product.id, { [key]: n })} prefix="₱" />
                    {!costable ? (
                      <span className="text-xs text-muted-foreground">
                        Can&apos;t say if this covers your costs until the recipe is priced.
                      </span>
                    ) : (
                      <span className={`text-xs font-semibold ${tierProfit >= 0 ? "text-success" : "text-danger"}`}>
                        {tierProfit >= 0 ? `${peso(tierProfit)} profit a jar` : `Loses ${peso(-tierProfit)} a jar`}
                      </span>
                    )}
                    {costable && product[key] > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {below ? `${peso(price - product[key])} below your normal price` : "At or above your normal price"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "price" && (
        <>

        <Step n={1}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              {costable ? (
                <>
                  It costs <span className="font-semibold">{peso(cost.costPerJar)}</span> to make one jar
                </>
              ) : (
                <>
                  <span className="font-semibold text-[#9A6B12]">Can&apos;t work out what a jar costs yet</span>
                  <span className="text-muted-foreground">{` — nothing bought for ${cost.unpriced.join(", ")}`}</span>
                </>
              )}
            </div>
            <button type="button" onClick={() => setTab("recipe")} className="text-xs font-semibold text-cacao">
              See the recipe
            </button>
          </div>
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
                  className={`rounded-lg px-3.5 py-2 text-[13px] ${product.pricingMode === m.mode ? "bg-card font-semibold shadow-sm" : "font-medium text-muted-foreground"}`}
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
              {costable ? (
                <div className={`font-display text-[26px] font-bold ${profit >= 0 ? "text-success" : "text-danger"}`}>{peso(profit)}</div>
              ) : (
                <div className="font-display text-[26px] font-bold text-muted-foreground">—</div>
              )}
            </div>
            <div className="rounded-xl bg-secondary px-4 py-3">
              <div className="text-xs font-semibold text-muted-foreground">Margin</div>
              {costable ? (
                <div className={`font-display text-[26px] font-bold ${margin >= 15 ? "text-success" : "text-danger"}`}>{Math.round(margin)}%</div>
              ) : (
                <div className="font-display text-[26px] font-bold text-muted-foreground">—</div>
              )}
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
        </>
        )}
      </div>
    </div>
  );
}

export function PricingScreen({ subnav }: { subnav?: ReactNode }) {
  const { products, entries } = useStore();
  const costCtx = useCostContext();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => buildPricingRows(products, entries, costCtx), [products, entries, costCtx]);
  const selected = products.find((p) => p.id === selectedId) ?? products[0];
  const [viewMode] = useViewMode();

  if (viewMode === "simple") {
    return (
      <Page title="Costing" subnav={subnav}>
        <SimplePrices />
      </Page>
    );
  }

  return (
    <Page title="Costing" subnav={subnav}>
      {products.length === 0 ? (
        <div className="rounded-2xl border border-line/15 bg-card px-6 py-12 text-center text-sm text-muted-foreground">
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
                  className={`rounded-xl bg-card px-4 py-3.5 text-left transition ${
                    p.id === selected?.id ? "border border-cacao shadow-sm" : "border border-line/15 hover:border-cacao/40"
                  }`}
                >
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="mt-1.5 flex justify-between text-[13px] text-muted-foreground">
                    <span>{peso(price)} / jar</span>
                    {cost.unpriced.length === 0 ? (
                      <span className={`font-semibold ${margin >= 15 ? "text-success" : "text-danger"}`}>
                        {Math.round(margin)}% margin
                      </span>
                    ) : (
                      <span className="font-semibold text-[#9A6B12]">margin unknown</span>
                    )}
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

