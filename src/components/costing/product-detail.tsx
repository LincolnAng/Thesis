"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Info } from "lucide-react";
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
 * One product's costing, laid out the way a beginner thinks it through, without hiding any figure:
 *
 *   ┌ header: photo, name, Edit details ───────────────────────────┐
 *   │ 1 What goes in → 2 What it costs → 3 What you sell it for    │  ← a stepper: where you are,
 *   │ ┌ the open step ────────────────┐ ┌ At a glance ───────────┐ │    what is done (✓)
 *   │ │ one job, with Back / Next      │ │ sells for, costs, keeps │ │
 *   │ └────────────────────────────────┘ │ batch, stock, shelf    │ │
 *   │                                    │ life, sizes            │ │
 *   └────────────────────────────────────┴────────────────────────┘
 *
 * Only one step shows at a time, and each ends with a button to the next, so the page reads as
 * a short path rather than a wall of panels. Every number about the product sits in "At a
 * glance" beside it, always visible; anything not known yet says so in words and links to the
 * step that fills it in.
 *
 * Executives only: the Costing page shows employees the product gallery instead, and the server
 * never sends an employee recipe costs to begin with (lib/auth/permissions).
 */

const STEPS = [
  { title: "What goes in", hint: "The ingredients and work that go into one batch." },
  { title: "What it costs", hint: "What it costs you to make one, worked out from step 1." },
  { title: "What you sell it for", hint: "Your selling price, and what you keep on each one." },
] as const;

/** The three steps across the top: each says whether it's done, and opens when tapped. */
function Stepper({ step, done, results, onPick }: { step: number; done: boolean[]; results: string[]; onPick: (n: number) => void }) {
  return (
    <ol className="grid grid-cols-3 gap-2">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const active = step === n;
        return (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => onPick(n)}
              aria-current={active ? "step" : undefined}
              className={`flex h-full w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                active ? "border-cacao bg-cacao/[0.06]" : "border-line/15 bg-card hover:border-cacao/40"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                  done[i] ? "bg-success text-white dark:text-ivory" : active ? "bg-cacao text-ivory" : "bg-secondary text-muted-foreground"
                }`}
              >
                {done[i] ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
              </span>
              <span className="min-w-0">
                <span className={`block text-[13.5px] font-semibold leading-tight ${active ? "text-cacao" : ""}`}>{s.title}</span>
                <span className="mt-0.5 hidden truncate text-[12px] text-muted-foreground min-[600px]:block">{results[i]}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

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

/** One line of "At a glance": a label, and its figure or what's missing. */
function Glance({ label, value, missing, onFix, tone }: { label: string; value?: string | null; missing?: string; onFix?: () => void; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {value != null ? (
        <span className={`text-[14px] font-semibold tabular-nums ${tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : ""}`}>{value}</span>
      ) : onFix ? (
        <button type="button" onClick={onFix} className="text-[13px] font-medium text-cacao underline decoration-dotted underline-offset-4">
          {missing}
        </button>
      ) : (
        <span className="text-[13px] text-muted-foreground">{missing}</span>
      )}
    </div>
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
  // Opens on the first step still to do; once all three are done, on the price.
  const [step, setStep] = useState(() => {
    const first = done.findIndex((d) => !d);
    return first === -1 ? 3 : first + 1;
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
  const family = familiesOf(products).find((f) => f.head.id === product.id || f.sizes.some((s) => s.id === product.id));
  const ingredientCount = product.recipeIngredients.length + (product.recipeComponents ?? []).length;
  const keep = perUnit != null && price > 0 ? price - perUnit : null;
  const results = [
    hasRecipe ? `${pluralize(ingredientCount, "ingredient")} in one batch` : "Not added yet",
    perUnit != null ? `${formatPeso(perUnit)} each to make` : "Not known yet",
    price > 0 ? `Sells for ${formatPeso(price)}` : "Not set yet",
  ];
  const go = (n: number) => {
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const nav = (
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-line/10 pt-4">
      {step > 1 ? (
        <button type="button" onClick={() => go(step - 1)} className="flex min-h-10 items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-cacao">
          <ArrowLeft className="h-4 w-4" /> {STEPS[step - 2].title}
        </button>
      ) : (
        <span />
      )}
      {step < 3 && (
        <button type="button" onClick={() => go(step + 1)} className="flex min-h-10 items-center gap-1.5 rounded-[10px] bg-cacao px-4 text-[13px] font-semibold text-ivory">
          Next: {STEPS[step].title} <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <Page title="Costing" subnav={subnav}>
      <div className="flex max-w-[1100px] flex-col gap-4">
        <button type="button" onClick={onBack} className="flex min-h-10 w-fit items-center gap-1.5 text-[14px] font-semibold text-cacao">
          <ArrowLeft className="h-4 w-4" /> All products
        </button>

        {/* Who this is */}
        <div className="flex items-center gap-4 overflow-hidden rounded-xl border border-line/15 bg-card pr-4">
          <div className="w-[88px] shrink-0 self-stretch min-[700px]:w-[120px] [&>div]:h-full [&>div]:min-h-[88px]">
            <ProductPhoto product={product} gradient={GRADIENTS[Math.max(0, index) % GRADIENTS.length]} photo={photos[product.id]} />
          </div>
          <div className="min-w-0 flex-1 py-3">
            <h2 className="font-display text-[22px] font-semibold leading-tight">{fullName(product, products)}</h2>
            <p className="text-[13px] text-muted-foreground">
              Sold by the {unit} · {done.filter(Boolean).length} of 3 steps done
            </p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="min-h-10 shrink-0 rounded-[10px] border border-line/20 px-3 text-[13px] font-semibold">
            Edit details
          </button>
        </div>

        <Stepper step={step} done={done} results={results} onPick={setStep} />

        <div className="grid grid-cols-1 items-start gap-4 min-[1000px]:grid-cols-[minmax(0,1fr)_300px]">
          {/* The open step */}
          <section className="rounded-xl border border-line/15 bg-card px-4 py-4 min-[700px]:px-5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Step {step} of 3</p>
            <h3 className="font-display text-[19px] font-semibold">{STEPS[step - 1].title}</h3>
            <p className="mb-4 text-[13px] text-muted-foreground">{STEPS[step - 1].hint}</p>

            {step === 1 && <RecipeEditor product={product} />}

            {step === 2 && (
              <>
                {perUnit != null ? (
                  <div>
                    <p className="font-display text-[30px] font-bold leading-tight tabular-nums">{formatPeso(perUnit)}</p>
                    <p className="text-[14px] text-muted-foreground">
                      to make one {unit}. A batch costs {formatPeso(cost.batchTotal)} and makes {pluralize(product.batchYield, unit)}.
                    </p>
                  </div>
                ) : (
                  <Note
                    action={
                      !hasRecipe ? (
                        <button type="button" onClick={() => go(1)} className="w-fit text-[13px] font-semibold text-cacao">
                          Go to step 1 →
                        </button>
                      ) : cost.unpriced.length === 0 && cost.unconvertible.length === 0 ? (
                        <button type="button" onClick={() => go(1)} className="w-fit text-[13px] font-semibold text-cacao">
                          Set it in step 1 →
                        </button>
                      ) : null
                    }
                  >
                    {!hasRecipe
                      ? "Add what goes into one batch in step 1, and the cost will appear here."
                      : cost.unpriced.length > 0
                        ? `We can't work out the cost yet — there's no price for ${cost.unpriced.join(", ")}. Log a purchase of it in Transactions to price it.`
                        : cost.unconvertible.length > 0
                          ? `Check the units on ${cost.unconvertible.join(", ")} — they couldn't be converted.`
                          : `Say how many ${unit}s one batch makes ("One batch makes" in step 1), and the cost per ${unit} will appear here.`}
                  </Note>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2 min-[700px]:grid-cols-4">
                  <Figure label="Ingredients, per batch" value={formatPeso(cost.ingredientTotal)} />
                  <Figure label="Packaging, labor & fixed" value={formatPeso(cost.packagingTotal + cost.laborTotal + cost.miscTotal)} />
                  <Figure label="Batch cost" value={formatPeso(cost.batchTotal)} />
                  <Figure label={`Cost per ${unit}`} value={perUnit != null ? formatPeso(perUnit) : "Not known yet"} />
                </div>
                <More label="See it line by line">
                  <CostBreakdown product={product} cost={cost} />
                </More>
              </>
            )}

            {step === 3 && <SimplePrice product={product} unitCost={perUnit} currentPrice={price} unit={unit} />}

            {nav}
          </section>

          {/* Every figure about the product, always in view */}
          <aside className="flex flex-col overflow-hidden rounded-xl border border-line/15 bg-card min-[1000px]:sticky min-[1000px]:top-4">
            <div className="px-4 pb-2 pt-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">At a glance</p>
              <Glance label="Sells for" value={price > 0 ? formatPeso(price) : null} missing="Set a price" onFix={() => go(3)} />
              <Glance label={`Costs to make one`} value={perUnit != null ? formatPeso(perUnit) : null} missing="Not known yet" onFix={() => go(hasRecipe ? 2 : 1)} />
              <Glance
                label="You keep on each"
                value={keep != null ? `${formatPeso(keep)}${price > 0 ? ` (${Math.round((keep / price) * 100)}%)` : ""}` : null}
                missing="Needs cost and price"
                tone={keep == null ? undefined : keep >= 0 ? "good" : "bad"}
              />
            </div>
            <div className="border-t border-line/10 px-4 py-2">
              <Glance label="One batch makes" value={product.batchYield > 0 ? pluralize(product.batchYield, unit) : null} missing="Not set" onFix={() => go(1)} />
              <Glance label="One batch costs" value={hasRecipe ? formatPeso(cost.batchTotal) : null} missing="Not known yet" onFix={() => go(1)} />
              <Glance label="On hand" value={pluralize(product.stockQty, unit)} />
              <Glance label="Warn when below" value={product.lowStockThreshold > 0 ? pluralize(product.lowStockThreshold, unit) : null} missing="Not set" onFix={() => setEditing(true)} />
            </div>
            <ProductExpiryStrip product={product} />
            {family && <SizeStrip head={family.head} sizes={family.sizes} onOpen={onOpenProduct} />}
          </aside>
        </div>
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
