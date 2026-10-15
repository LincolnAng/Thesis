"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, Check, Info } from "lucide-react";
import { Page } from "@/components/layout/page";
import { ProductPhoto, GRADIENTS } from "@/components/costing/products-screen";
import { PriceCalculator } from "@/components/costing/price-calculator";
import { RecipePanel } from "@/components/costing/recipe-panel";
import { StockPanel } from "@/components/costing/stock-panel";
import { EditProductDialog } from "@/components/stock/edit-product-dialog";
import { useStore } from "@/lib/store/use-store";
import { useProductPhotos } from "@/lib/products/photos";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { familiesOf, fullName } from "@/lib/summary/product-sizes";
import { formatPeso } from "@/lib/format";

/**
 * One product, in three plainly named tabs — one job each:
 *
 *   Recipe        what goes into ONE unit — ingredients, packaging, your time, other costs —
 *                 each with its cost, adding up to what one costs to make
 *   Price         the three ways to set a price, side by side, and what you keep
 *   Stock & sizes what's on hand, how long it keeps, the usual batch size, the other sizes
 *
 * Everything is per unit, because batches vary in size; the batch size is only for planning
 * production (lib/costing/per-unit).
 *
 * Above the tabs, the three numbers that matter — price, cost, what you keep — always in view;
 * one that isn't known yet says so and links to the tab that fills it in. Recipe and Price
 * carry a tick once they're done, and the page opens on the first one that isn't.
 *
 * Executives only: the Costing page shows employees the product gallery instead, and the server
 * never sends an employee recipe costs to begin with (lib/auth/permissions).
 */

type Tab = "recipe" | "price" | "stock";

const TABS: [Tab, string][] = [
  ["recipe", "Recipe"],
  ["price", "Price"],
  ["stock", "Stock & sizes"],
];

/** A note about something still to do — calm, with the way to fix it. */
function Note({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg bg-secondary px-3.5 py-3 text-[14px]">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-cacao" />
      <div className="flex flex-col gap-1">
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}


/** One of the three numbers in the header: the figure, or what's missing as a link to fix it. */
function KeyFigure({ label, value, missing, onFix, tone }: { label: string; value: string | null; missing: string; onFix: () => void; tone?: "good" | "bad" }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      {value != null ? (
        <span className={`font-display text-[20px] font-bold leading-tight tabular-nums ${tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : ""}`}>{value}</span>
      ) : (
        <button type="button" onClick={onFix} className="w-fit text-left text-[14px] font-medium leading-7 text-cacao underline decoration-dotted underline-offset-4">
          {missing}
        </button>
      )}
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
  const complete = !!product && !!cost && cost.unpriced.length === 0 && cost.unconvertible.length === 0 && hasRecipe;
  // Per unit, whatever the batch size (lib/costing/per-unit).
  const perUnit = cost && complete ? Math.round(cost.costPerJar * 100) / 100 : null;

  const done: Partial<Record<Tab, boolean>> = { recipe: perUnit != null, price: price > 0 };
  const [tab, setTab] = useState<Tab>(() => (["recipe", "price"] as Tab[]).find((t) => !done[t]) ?? "recipe");

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
  const family = familiesOf(products).find((f) => f.head.id === product.id || f.sizes.some((s) => s.id === product.id));
  const keep = perUnit != null && price > 0 ? price - perUnit : null;

  return (
    <Page title="Costing" subnav={subnav}>
      <div className="flex max-w-[860px] flex-col gap-4">
        <button type="button" onClick={onBack} className="flex min-h-10 w-fit items-center gap-1.5 text-[14px] font-semibold text-cacao">
          <ArrowLeft className="h-4 w-4" /> All products
        </button>

        {/* The product, and the three numbers that matter */}
        <div className="flex overflow-hidden rounded-xl border border-line/15 bg-card">
          <div className="w-[96px] shrink-0 min-[700px]:w-[132px] [&>div]:h-full [&>div]:min-h-[110px]">
            <ProductPhoto product={product} gradient={GRADIENTS[Math.max(0, index) % GRADIENTS.length]} photo={photos[product.id]} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-display text-[22px] font-semibold leading-tight">{fullName(product, products)}</h2>
              <button type="button" onClick={() => setEditing(true)} className="min-h-9 rounded-[10px] border border-line/20 px-3 text-[13px] font-semibold">
                Edit details
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <KeyFigure label="Sells for" value={price > 0 ? formatPeso(price) : null} missing="Set a price" onFix={() => setTab("price")} />
              <KeyFigure label={`Costs to make one`} value={perUnit != null ? formatPeso(perUnit) : null} missing="Not known yet" onFix={() => setTab("recipe")} />
              <KeyFigure
                label="You keep on each"
                value={keep != null ? formatPeso(keep) : null}
                missing="Needs cost & price"
                onFix={() => setTab(perUnit == null ? "recipe" : "price")}
                tone={keep == null ? undefined : keep >= 0 ? "good" : "bad"}
              />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="About this product" className="flex gap-1 overflow-x-auto border-b border-line/15">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3.5 text-[14px] font-semibold transition ${
                tab === key ? "border-cacao text-cacao" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {done[key] === true && <Check className="h-3.5 w-3.5 text-success" strokeWidth={3} aria-label="done" />}
              {done[key] === false && <span className="h-1.5 w-1.5 rounded-full bg-cacao/50" aria-label="to do" />}
            </button>
          ))}
        </div>

        <section role="tabpanel" className="rounded-xl border border-line/15 bg-card px-4 py-4 min-[700px]:px-5">
          {tab === "recipe" && (
            <div className="flex flex-col gap-4">
              {hasRecipe && perUnit == null && (
                <Note>
                  {cost.unpriced.length > 0
                    ? `We can't work out the cost yet — there's no price for ${cost.unpriced.join(", ")}. Log a purchase of it in Transactions to price it.`
                    : `Check the units on ${cost.unconvertible.join(", ")} — they couldn't be converted.`}
                </Note>
              )}
              <RecipePanel product={product} />
            </div>
          )}

          {tab === "price" && (
            <PriceCalculator
              key={`${product.id}-${product.pricingMode}-${product.standardPrice}-${product.marginPercent}`}
              product={product}
              unitCost={perUnit}
              currentPrice={price}
              unit={unit}
            />
          )}

          {tab === "stock" && <StockPanel product={product} family={family} onOpenProduct={onOpenProduct} />}
        </section>
      </div>

      {editing && <EditProductDialog key={product.id} product={product} products={products} onClose={() => setEditing(false)} />}
    </Page>
  );
}
