"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import { Page } from "@/components/layout/page";
import { ProductPhoto, GRADIENTS } from "@/components/costing/products-screen";
import { PriceCalculator } from "@/components/costing/price-calculator";
import { RecipeEditor } from "@/components/finance/pricing-calculator-card";
import { CostBreakdown } from "@/components/pricing/cost-breakdown";
import { ProductExpiryStrip } from "@/components/products/product-expiry-strip";
import { SizeStrip } from "@/components/products/size-strip";
import { EditProductDialog } from "@/components/stock/edit-product-dialog";
import { useStore } from "@/lib/store/use-store";
import { updateProduct } from "@/lib/store/store";
import { useProductPhotos } from "@/lib/products/photos";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { familiesOf, fullName } from "@/lib/summary/product-sizes";
import { costPerUnit } from "@/lib/costing/price-calc";
import { formatPeso, pluralize } from "@/lib/format";
import type { Product } from "@/lib/store/types";

/**
 * One product's costing as three steps, in the order a person thinks it through:
 *
 *   1. What goes in         — the recipe: what one batch takes
 *   2. What it costs        — one number, with the working behind a "see the details"
 *   3. What you sell it for — one question, with the markup and margin methods behind "more options"
 *
 * Only the first step that still needs doing is open; finished steps fold to a single line of
 * result, so a beginner is never looking at everything at once. Stock, shelf life and sizes sit
 * in "More about this product", out of the way until wanted.
 *
 * Executives only: the Costing page shows employees the product gallery instead, and the server
 * never sends an employee recipe costs to begin with (lib/auth/permissions).
 */

function Step({
  n,
  title,
  result,
  done,
  open,
  onToggle,
  children,
}: {
  n: number;
  title: string;
  /** One line of what this step came to, shown when it is folded. */
  result: string;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-xl border bg-card ${open ? "border-cacao/30" : "border-line/15"}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ${
            done ? "bg-success text-white dark:text-ivory" : "bg-cacao/10 text-cacao"
          }`}
        >
          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{title}</span>
          {!open && <span className="block truncate text-[13px] text-muted-foreground">{result}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-line/10 px-4 py-4">{children}</div>}
    </section>
  );
}

/** A quiet link that reveals the detail behind a simple answer. */
function More({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-1 text-[13px] font-semibold text-cacao">
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** What to sell it for: one question, an answer that says what you keep, and a few suggestions. */
function SimplePrice({ product, unitCost, currentPrice, unit }: { product: Product; unitCost: number | null; currentPrice: number; unit: string }) {
  const [value, setValue] = useState(currentPrice > 0 ? String(currentPrice) : "");
  const [saved, setSaved] = useState<string | null>(null);

  const typed = Number(value.replace(/[^0-9.]/g, ""));
  const price = value !== "" && Number.isFinite(typed) && typed > 0 ? typed : null;
  const keep = price != null && unitCost != null ? price - unitCost : null;
  const keepPct = keep != null && price != null ? Math.round((keep / price) * 100) : null;
  const unchanged = price != null && Math.abs(price - currentPrice) < 0.005 && product.pricingMode === "manual";

  function save() {
    if (price == null) return;
    updateProduct(product.id, { pricingMode: "manual", standardPrice: price });
    setSaved(`Saved — it now sells for ${formatPeso(price)} each.`);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px]">
        {unitCost != null ? (
          <>
            It costs you <span className="font-semibold">{formatPeso(unitCost)}</span> to make one {unit}. How much will you sell it for?
          </>
        ) : (
          <>How much will you sell one {unit} for?</>
        )}
      </p>

      <div className="relative max-w-[240px]">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] font-semibold text-muted-foreground">₱</span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/[^0-9.]/g, ""));
            setSaved(null);
          }}
          aria-label={`Selling price for one ${unit}`}
          placeholder="0"
          className="h-14 w-full rounded-lg border border-input bg-transparent pl-9 pr-3 text-[22px] font-bold tabular-nums outline-none focus:border-cacao"
        />
      </div>

      {unitCost != null && (
        <div className="flex flex-wrap gap-2" aria-label="Suggested prices">
          {(
            [
              ["+30%", 1.3],
              ["+50%", 1.5],
              ["Double it", 2],
            ] as const
          ).map(([label, factor]) => {
            const suggested = Math.ceil(unitCost * factor);
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setValue(String(suggested));
                  setSaved(null);
                }}
                className="min-h-9 rounded-full border border-line/25 bg-card px-3.5 text-[13px] font-semibold transition hover:border-cacao hover:text-cacao active:scale-95"
              >
                {label} · {formatPeso(suggested)}
              </button>
            );
          })}
        </div>
      )}

      {keep != null && keepPct != null ? (
        <p className={`text-[14px] font-semibold ${keep >= 0 ? "text-success" : "text-danger"}`}>
          {keep >= 0 ? `You keep ${formatPeso(keep)} on each ${unit} (${keepPct}% of the price).` : `You lose ${formatPeso(-keep)} on each ${unit}.`}
        </p>
      ) : (
        unitCost == null && (
          <p className="text-[13px] text-muted-foreground">Finish step 1 and the ingredient prices and we&apos;ll show what you keep on each one.</p>
        )
      )}

      {product.pricingMode !== "manual" && currentPrice > 0 && (
        <p className="text-[12.5px] text-muted-foreground">
          Right now the price follows your cost at {product.marginPercent}% {product.pricingMode === "margin" ? "margin" : "markup"}. Saving a price here fixes it instead.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={price == null || unchanged}
          className="min-h-11 rounded-[10px] bg-cacao px-5 text-[14px] font-semibold text-ivory transition active:scale-[0.98] disabled:opacity-40"
        >
          Save price
        </button>
        {saved && <span className="text-[13px] font-semibold text-success">{saved}</span>}
      </div>

      <More label="More ways to set the price">
        <PriceCalculator
          key={`${product.id}-${product.pricingMode}-${product.standardPrice}-${product.marginPercent}`}
          product={product}
          unitCost={unitCost}
          currentPrice={currentPrice}
          unit={unit}
        />
      </More>
    </div>
  );
}

export function ProductDetail({
  productId,
  subnav,
  onBack,
  onOpenProduct,
}: {
  productId: string;
  subnav?: ReactNode;
  onBack: () => void;
  /** Another size of the same product. */
  onOpenProduct: (id: string) => void;
}) {
  const { products } = useStore();
  const costCtx = useCostContext();
  const photos = useProductPhotos();
  const [editing, setEditing] = useState(false);
  const index = products.findIndex((p) => p.id === productId);
  const product = products[index];

  const cost = product ? productCostPerJar(product, costCtx) : null;
  const price = product && cost ? effectiveProductPrice(product, cost) : 0;
  const hasRecipe = !!product && (product.recipeIngredients.length > 0 || (product.recipeComponents ?? []).length > 0);
  const complete = !!product && !!cost && cost.unpriced.length === 0 && cost.unconvertible.length === 0 && product.recipeIngredients.length > 0;
  const perUnit = product && cost ? costPerUnit(cost.batchTotal, product.batchYield, complete) : null;

  const done = [hasRecipe, perUnit != null, price > 0];
  // The first step still to do opens by itself; the rest fold to one line each.
  const [openStep, setOpenStep] = useState<number | null>(() => {
    const first = done.findIndex((d) => !d);
    return first === -1 ? null : first + 1;
  });

  if (!product || !cost) {
    return (
      <Page title="Costing" subnav={subnav}>
        <div className="rounded-2xl border border-line/15 bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          This product isn&apos;t in Costing any more.{" "}
          <button type="button" onClick={onBack} className="font-semibold text-cacao">
            Back to all products
          </button>
        </div>
      </Page>
    );
  }

  const unit = (product.unit || "jar").replace(/s$/, "");
  const toggle = (n: number) => setOpenStep((cur) => (cur === n ? null : n));
  const family = familiesOf(products).find((f) => f.head.id === product.id || f.sizes.some((s) => s.id === product.id));
  const ingredientCount = product.recipeIngredients.length + (product.recipeComponents ?? []).length;

  return (
    <Page title="Costing" subnav={subnav}>
      <div className="flex max-w-[760px] flex-col gap-3">
        <button type="button" onClick={onBack} className="flex min-h-11 w-fit items-center gap-1.5 text-[14px] font-semibold text-cacao">
          <ArrowLeft className="h-4 w-4" /> All products
        </button>

        {/* The product, in one glance */}
        <div className="grid grid-cols-[96px_1fr] overflow-hidden rounded-xl border border-line/15 bg-card min-[700px]:grid-cols-[140px_1fr]">
          <div className="[&>div]:h-full [&>div]:min-h-[96px]">
            <ProductPhoto product={product} gradient={GRADIENTS[Math.max(0, index) % GRADIENTS.length]} photo={photos[product.id]} />
          </div>
          <div className="flex flex-col gap-1.5 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-[20px] font-semibold leading-tight">{fullName(product, products)}</h2>
              <button type="button" onClick={() => setEditing(true)} className="min-h-10 rounded-[10px] border border-line/20 px-3 text-[13px] font-semibold">
                Edit details
              </button>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[14px]">
              <span>
                Sells for <span className="font-bold">{price > 0 ? formatPeso(price) : "—"}</span>
              </span>
              <span>
                Costs <span className="font-bold">{perUnit != null ? formatPeso(perUnit) : "—"}</span>
              </span>
              {perUnit != null && price > 0 && (
                <span className={`font-bold ${price - perUnit >= 0 ? "text-success" : "text-danger"}`}>
                  {price - perUnit >= 0 ? `Keeps ${formatPeso(price - perUnit)}` : `Loses ${formatPeso(perUnit - price)}`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 1. What goes in */}
        <Step
          n={1}
          title="What goes in"
          result={hasRecipe ? `${pluralize(ingredientCount, "ingredient")} in one batch` : "Add what goes into one batch"}
          done={done[0]}
          open={openStep === 1}
          onToggle={() => toggle(1)}
        >
          <RecipeEditor product={product} />
        </Step>

        {/* 2. What it costs */}
        <Step
          n={2}
          title="What it costs"
          result={perUnit != null ? `${formatPeso(perUnit)} each to make` : "Not known yet"}
          done={done[1]}
          open={openStep === 2}
          onToggle={() => toggle(2)}
        >
          {perUnit != null ? (
            <div>
              <p className="font-display text-[30px] font-bold leading-tight tabular-nums">{formatPeso(perUnit)}</p>
              <p className="text-[14px] text-muted-foreground">
                to make one {unit}. A batch costs {formatPeso(cost.batchTotal)} and makes {pluralize(product.batchYield, unit)}.
              </p>
            </div>
          ) : (
            <p className="text-[14px] text-[#9A6B12]">
              {!hasRecipe
                ? "Add what goes into one batch in step 1, and the cost will appear here."
                : cost.unpriced.length > 0
                  ? `We can't work out the cost yet — no price for ${cost.unpriced.join(", ")}. Log a purchase of it to price it.`
                  : cost.unconvertible.length > 0
                    ? `Check the units on ${cost.unconvertible.join(", ")} — they couldn't be converted.`
                    : `Say how many ${unit}s one batch makes (under Edit details), and the cost per ${unit} will appear here.`}
            </p>
          )}
          <More label="See how it adds up">
            <div className="grid grid-cols-2 gap-2 min-[700px]:grid-cols-4">
              <Figure label="Ingredients, per batch" value={formatPeso(cost.ingredientTotal)} />
              <Figure label="Packaging, labor & fixed" value={formatPeso(cost.packagingTotal + cost.laborTotal + cost.miscTotal)} />
              <Figure label="Batch cost" value={formatPeso(cost.batchTotal)} />
              <Figure label={`Cost per ${unit}`} value={perUnit != null ? formatPeso(perUnit) : "—"} />
            </div>
            <div className="mt-3">
              <CostBreakdown product={product} cost={cost} />
            </div>
          </More>
        </Step>

        {/* 3. What you sell it for */}
        <Step
          n={3}
          title="What you sell it for"
          result={price > 0 ? `Sells for ${formatPeso(price)}` : "Not set yet"}
          done={done[2]}
          open={openStep === 3}
          onToggle={() => toggle(3)}
        >
          <SimplePrice product={product} unitCost={perUnit} currentPrice={price} unit={unit} />
        </Step>

        {/* Everything else, out of the way */}
        <details className="rounded-xl border border-line/15 bg-card">
          <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 text-[14px] font-semibold marker:content-none">
            More about this product
            <span className="text-[13px] font-normal text-muted-foreground">{pluralize(product.stockQty, unit)} on hand · shelf life · sizes</span>
          </summary>
          <div className="border-t border-line/10">
            <ProductExpiryStrip product={product} />
            {family && (
              <div className="border-t border-line/10">
                <SizeStrip head={family.head} sizes={family.sizes} onOpen={onOpenProduct} />
              </div>
            )}
          </div>
        </details>
      </div>

      {editing && <EditProductDialog key={product.id} product={product} products={products} onClose={() => setEditing(false)} />}
    </Page>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-secondary px-3 py-2">
      <div className="text-[11.5px] font-semibold text-muted-foreground">{label}</div>
      <div className="text-[16px] font-bold tabular-nums">{value}</div>
      {note && <div className="text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}
