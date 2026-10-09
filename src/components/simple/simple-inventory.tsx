"use client";

import { Plus } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { cacaoUtilizationPct, expiringWithinDays, setShelfLifeDays, shelfLifeDays } from "@/lib/summary/business-config";
import { allStandings } from "@/lib/summary/material-stock";
import { productExpiry } from "@/lib/summary/product-lots";
import { formatPrice, pluralize } from "@/lib/format";
import { AdvancedHint, BigButton, Em, Headline, SectionTitle } from "@/components/simple/simple-ui";
import type { Product } from "@/lib/store/types";

/**
 * Inventory in Simple mode: what you sell, and what you've run out of.
 *
 * Advanced answers "what is this made of, what did each input cost, and how is it classified".
 * Those are real questions and they are not the ones asked at six in the morning with a
 * delivery waiting. Dropped here on purpose: the ingredients-versus-supplies split, average
 * cost per kilo, where each price came from, roasting loss, units, and the carousel — none of
 * them change what she does next, and all of them were on the screen.
 *
 * What is left is the two things that do: how many jars of each product there are, and which
 * ingredients she cannot make anything with. Shelf life stays because it is the one number
 * here she has to tell the app rather than the other way round.
 */

function ProductRow({ product, onEdit }: { product: Product; onEdit: () => void }) {
  const { entries, businessSettings } = useStore();
  const ctx = useCostContext();
  const cost = productCostPerJar(product, ctx);
  const price = effectiveProductPrice(product, cost);
  const costable = cost.unpriced.length === 0;
  const keep = price - cost.costPerJar;
  const life = shelfLifeDays(businessSettings, product.id);
  const expiry = productExpiry(entries, product, life, expiringWithinDays(businessSettings));
  const low = product.stockQty <= product.lowStockThreshold;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line/15 bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <button type="button" onClick={onEdit} className="font-display text-[18px] font-semibold hover:text-cacao">
          {product.name}
        </button>
        <span className="text-[13px] font-semibold text-cacao">
          <button type="button" onClick={onEdit}>
            Change
          </button>
        </span>
      </div>

      <p className="text-[16px] leading-relaxed">
        You have{" "}
        <Em tone={low ? "bad" : "good"}>{pluralize(product.stockQty, "jar")}</Em> on the shelf, selling at{" "}
        <Em>{formatPrice(price)}</Em>.{" "}
        {costable ? (
          keep > 0 ? (
            <>
              You keep <Em tone="good">{formatPrice(keep)}</Em> a jar.
            </>
          ) : (
            <>
              Each one <Em tone="bad">loses {formatPrice(-keep)}</Em>.
            </>
          )
        ) : (
          <span className="text-muted-foreground">
            {`What you keep can't be worked out until you log buying ${cost.unpriced.join(", ")}.`}
          </span>
        )}
      </p>

      {expiry.tracksAnything && (expiry.expired > 0 || expiry.expiring > 0) && (
        <p className="text-[15px] leading-relaxed">
          {expiry.expired > 0 ? (
            <>
              <Em tone="bad">{pluralize(expiry.expired, "jar")}</Em> {expiry.expired === 1 ? "is" : "are"} already past
              the date.
            </>
          ) : (
            <>
              Sell <Em tone="warn">{pluralize(expiry.expiring, "jar")}</Em> soon — nearly out of time.
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line/10 pt-3 text-[14px] text-muted-foreground">
        <span>Stays good for</span>
        <input
          type="text"
          inputMode="numeric"
          defaultValue={life}
          onBlur={(e) => {
            const days = Number(e.target.value.trim());
            if (Number.isFinite(days) && days > 0 && days !== life) setShelfLifeDays(product.id, days);
            else e.target.value = String(life);
          }}
          className="h-9 w-16 rounded-lg border border-input bg-transparent px-2 text-center text-[15px] tabular-nums"
          aria-label={`How many days ${product.name} stays good`}
        />
        <span>days after you make it</span>
      </div>
    </div>
  );
}

export function SimpleInventory({ onAddProduct, onEditProduct }: { onAddProduct: () => void; onEditProduct: (id: string) => void }) {
  const { products, rawMaterials, entries, businessSettings } = useStore();
  const utilization = cacaoUtilizationPct(businessSettings) / 100;

  // Only the ingredients she cannot make anything with. A full list of what is on the shelf,
  // with prices and units, is what Advanced is for.
  const out = allStandings(entries, products, rawMaterials, utilization).filter((r) => r.tracked && r.onHand <= 0);

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6">
      {out.length > 0 ? (
        <Headline tone="bad" sub="You can't make anything that needs them until you buy more.">
          You&apos;ve run out of <Em tone="bad">{out.map((r) => r.material.name).join(", ")}</Em>.
        </Headline>
      ) : (
        <Headline tone="good" sub="Everything your recipes need is on the shelf.">
          You have what you need to make things.
        </Headline>
      )}

      <div>
        <SectionTitle>What you sell</SectionTitle>
        <div className="flex flex-col gap-4">
          {products.length === 0 ? (
            <p className="rounded-2xl border border-line/15 bg-card p-5 text-[15px] text-muted-foreground">
              No products yet. Add the first one below.
            </p>
          ) : (
            products.map((p) => <ProductRow key={p.id} product={p} onEdit={() => onEditProduct(p.id)} />)
          )}
        </div>
      </div>

      <BigButton icon={Plus} label="Add a new product" hint="Something new you sell" onClick={onAddProduct} />

      <AdvancedHint what="ingredients, supplies, what each one costs, and roasting loss" />
    </div>
  );
}
