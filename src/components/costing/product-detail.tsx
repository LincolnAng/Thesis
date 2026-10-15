"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Page } from "@/components/layout/page";
import { ProductPhoto, GRADIENTS } from "@/components/costing/products-screen";
import { PriceCalculator } from "@/components/costing/price-calculator";
import { RecipeEditor } from "@/components/finance/pricing-calculator-card";
import { CostBreakdown } from "@/components/pricing/cost-breakdown";
import { EditProductDialog } from "@/components/stock/edit-product-dialog";
import { useStore } from "@/lib/store/use-store";
import { useProductPhotos } from "@/lib/products/photos";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { fullName } from "@/lib/summary/product-sizes";
import { costPerUnit } from "@/lib/costing/price-calc";
import { formatPeso, pluralize } from "@/lib/format";

/**
 * One product's costing, all in one place — no going back and forth between a product list and
 * a separate calculator:
 *
 *   1. The product: photo, name, size, price and stock, with Edit for its details
 *   2. Recipe and ingredients — what one batch takes, with labor and fixed costs
 *   3. Cost breakdown — every line, the batch total, and the cost of one finished unit
 *   4. Price calculator — try a price; nothing changes until it's saved
 *
 * Executives only: the Costing page shows employees the product gallery instead, and the server
 * never sends an employee recipe costs to begin with (lib/auth/permissions).
 */

function Section({ title, hint, children, defaultOpen = true }: { title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-line/15 bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-3 text-left"
      >
        <span>
          <span className="block font-display text-[18px] font-semibold">{title}</span>
          {hint && <span className="block text-[13px] text-muted-foreground">{hint}</span>}
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-line/10 px-5 py-4">{children}</div>}
    </section>
  );
}

export function ProductDetail({ productId, subnav, onBack }: { productId: string; subnav?: ReactNode; onBack: () => void }) {
  const { products } = useStore();
  const costCtx = useCostContext();
  const photos = useProductPhotos();
  const [editing, setEditing] = useState(false);
  const index = products.findIndex((p) => p.id === productId);
  const product = products[index];

  if (!product) {
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

  const cost = productCostPerJar(product, costCtx);
  const price = effectiveProductPrice(product, cost);
  const unit = (product.unit || "jar").replace(/s$/, "");
  const complete = cost.unpriced.length === 0 && cost.unconvertible.length === 0 && product.recipeIngredients.length > 0;
  const perUnit = costPerUnit(cost.batchTotal, product.batchYield, complete);

  return (
    <Page title="Costing" subnav={subnav}>
      <div className="flex flex-col gap-4">
        <button type="button" onClick={onBack} className="flex min-h-11 w-fit items-center gap-1.5 text-[14px] font-semibold text-cacao">
          <ArrowLeft className="h-4 w-4" /> All products
        </button>

        {/* 1. The product */}
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-line/15 bg-card min-[700px]:grid-cols-[240px_1fr]">
          <ProductPhoto product={product} gradient={GRADIENTS[Math.max(0, index) % GRADIENTS.length]} photo={photos[product.id]} />
          <div className="flex flex-col gap-2 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-display text-[24px] font-semibold leading-tight">{fullName(product, products)}</h2>
              <button type="button" onClick={() => setEditing(true)} className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold">
                Edit details
              </button>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
              <span>
                Sells for <span className="font-semibold">{price > 0 ? formatPeso(price) : "— no price yet"}</span>
              </span>
              <span>
                Costs <span className="font-semibold">{perUnit != null ? formatPeso(perUnit) : "— not known yet"}</span> to make
              </span>
              <span>{pluralize(product.stockQty, unit)} on hand</span>
            </div>
            {perUnit != null && price > 0 && (
              <p className={`text-[14px] font-semibold ${price - perUnit >= 0 ? "text-success" : "text-danger"}`}>
                {price - perUnit >= 0 ? `${formatPeso(price - perUnit)} profit on each ${unit}` : `Loses ${formatPeso(perUnit - price)} on each ${unit}`}
              </p>
            )}
          </div>
        </div>

        {/* 2. Recipe */}
        <Section title="Recipe and ingredients" hint={`What one batch takes, and how many ${unit}s it makes. Changes save as you make them.`}>
          <RecipeEditor product={product} />
        </Section>

        {/* 3. Cost breakdown */}
        <Section title="Cost breakdown" hint={`Every cost in one ${unit}, and the batch it comes from.`}>
          <div className="grid grid-cols-2 gap-2 min-[700px]:grid-cols-4">
            <Figure label="Ingredients, per batch" value={formatPeso(cost.ingredientTotal)} />
            <Figure label="Packaging, labor & fixed" value={formatPeso(cost.packagingTotal + cost.laborTotal + cost.miscTotal)} />
            <Figure label="Batch cost" value={formatPeso(cost.batchTotal)} />
            <Figure
              label={`Cost per ${unit}`}
              value={perUnit != null ? formatPeso(perUnit) : "—"}
              note={
                product.batchYield > 0
                  ? `${formatPeso(cost.batchTotal)} ÷ ${pluralize(product.batchYield, unit)}`
                  : `Set how many ${unit}s one batch makes`
              }
            />
          </div>
          {!complete && (
            <p className="mt-3 text-[13px] text-[#9A6B12]">
              {product.recipeIngredients.length === 0
                ? "No recipe yet — add what goes into one batch above."
                : cost.unpriced.length > 0
                  ? `Not fully costed yet — no cost for ${cost.unpriced.join(", ")}. Log a purchase of it to price it.`
                  : `Check the units on ${cost.unconvertible.join(", ")} — they couldn't be converted.`}
            </p>
          )}
          <CostBreakdown product={product} cost={cost} />
        </Section>

        {/* 4. Price calculator */}
        <Section title="Price calculator" hint="Try a price. Nothing changes until you press Save.">
          <PriceCalculator key={`${product.id}-${product.pricingMode}-${product.standardPrice}-${product.marginPercent}`} product={product} unitCost={perUnit} currentPrice={price} unit={unit} />
        </Section>
      </div>

      {editing && <EditProductDialog key={product.id} product={product} products={products} onClose={() => setEditing(false)} />}
    </Page>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-secondary px-3.5 py-2.5">
      <div className="text-[12px] font-semibold text-muted-foreground">{label}</div>
      <div className="font-display text-[20px] font-bold">{value}</div>
      {note && <div className="text-[11.5px] text-muted-foreground">{note}</div>}
    </div>
  );
}
