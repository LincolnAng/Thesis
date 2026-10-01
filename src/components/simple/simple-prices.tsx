"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store/use-store";
import { updateProduct } from "@/lib/store/store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { formatPeso } from "@/lib/format";
import type { Product } from "@/lib/store/types";
import { AdvancedHint, Em, Headline } from "@/components/simple/simple-ui";

/** Pesos with centavos when there are any (₱57.60), whole otherwise (₱180). */
function peso(n: number) {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? formatPeso(r) : `${r < 0 ? "−" : ""}₱${Math.abs(r).toFixed(2)}`;
}

function PriceCard({ product, cost, price }: { product: Product; cost: number; price: number }) {
  const [trying, setTrying] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const keep = price - cost;
  const tryPrice = trying ?? Math.round(price);
  const tryKeep = tryPrice - cost;
  const min = Math.max(1, Math.floor(cost * 0.8));
  const max = Math.max(Math.ceil(cost * 3), Math.ceil(price * 1.5), min + 10);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line/15 bg-white p-5">
      <div>
        <div className="font-display text-[18px] font-semibold">{product.name}</div>
        <p className="mt-1 text-[16px] leading-relaxed">
          You sell it for <Em>{peso(price)}</Em>. It costs you <Em>{peso(cost)}</Em> to make.{" "}
          {keep > 0 ? (
            <>
              You keep <Em tone="good">{peso(keep)}</Em> a jar.
            </>
          ) : (
            <>
              You <Em tone="bad">lose {peso(-keep)}</Em> on every jar — the price should be higher.
            </>
          )}
        </p>
      </div>

      <div className="rounded-xl bg-secondary px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <span className="font-semibold">Try a different price</span>
          <span>
            At <Em>{peso(tryPrice)}</Em> you&apos;d keep <Em tone={tryKeep > 0 ? "good" : "bad"}>{peso(tryKeep)}</Em> a jar
          </span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={tryPrice}
          onChange={(e) => {
            setTrying(Number(e.target.value));
            setConfirming(false);
          }}
          className="mt-2 w-full accent-cacao"
          aria-label={`Try a price for ${product.name}`}
        />
        {trying !== null && Math.round(price) !== tryPrice && (
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[13px]">
            {confirming ? (
              <>
                <span className="text-muted-foreground">Change the price to {peso(tryPrice)}?</span>
                <button type="button" onClick={() => setConfirming(false)} className="px-2 font-semibold text-muted-foreground">
                  No
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateProduct(product.id, { pricingMode: "manual", standardPrice: tryPrice });
                    setTrying(null);
                    setConfirming(false);
                  }}
                  className="rounded-lg bg-cacao px-3.5 py-1.5 font-semibold text-ivory"
                >
                  Yes, change it
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setTrying(null)} className="px-2 font-semibold text-muted-foreground">
                  Reset
                </button>
                <button type="button" onClick={() => setConfirming(true)} className="rounded-lg bg-cacao px-3.5 py-1.5 font-semibold text-ivory">
                  Use {peso(tryPrice)} as my price
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Prices in Simple mode: what each jar sells for, costs, and leaves you — and a slider to try another price. */
export function SimplePrices() {
  const { products } = useStore();
  const costCtx = useCostContext();
  const rows = products.map((p) => {
    const cost = productCostPerJar(p, costCtx).costPerJar;
    return { p, cost, price: effectiveProductPrice(p, productCostPerJar(p, costCtx)) };
  });
  const losing = rows.filter((r) => r.price - r.cost <= 0);

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6">
      {rows.length === 0 ? (
        <Headline>No products yet.</Headline>
      ) : losing.length > 0 ? (
        <Headline tone="bad" sub="Try a higher price below, or check what the ingredients cost.">
          <Em tone="bad">{losing.map((r) => r.p.name).join(", ")}</Em> {losing.length === 1 ? "costs" : "cost"} more to make than {losing.length === 1 ? "it sells" : "they sell"} for.
        </Headline>
      ) : (
        <Headline tone="good" sub="“Keep” is what's left from each jar's price after paying for what went into it.">
          Every product makes you money.
        </Headline>
      )}

      {costCtx.hourlyLaborRate === 0 && (
        <p className="rounded-xl border border-[#9A6B12]/30 bg-[#9A6B12]/[0.06] px-4 py-3 text-[13px]">
          Your own time isn&apos;t counted in these costs yet, so the amounts you keep look higher than they really are.{" "}
          <Link href="/settings" className="font-semibold text-cacao">
            Set what an hour of your work is worth
          </Link>
          .
        </p>
      )}

      {rows.map((r) => (
        <PriceCard key={r.p.id} product={r.p} cost={r.cost} price={r.price} />
      ))}

      <AdvancedHint what="pricing methods, recipes, or friend and wholesale prices" />
    </div>
  );
}
