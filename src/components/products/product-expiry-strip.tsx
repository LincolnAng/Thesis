"use client";

import { useStore } from "@/lib/store/use-store";
import { bulkUnitFor, caseSize, caseWord, expiringWithinDays, setShelfLifeDays, shelfLifeDays } from "@/lib/summary/business-config";
import { updateProduct } from "@/lib/store/store";
import { productExpiry } from "@/lib/summary/product-lots";
import { pluralize } from "@/lib/format";
import type { Product } from "@/lib/store/types";

/**
 * How much of this product is about to stop being sellable.
 *
 * Stock was one number, and a number cannot go off — forty jars read the same whether they
 * were made last week or last winter. This splits the shelf by the day each batch was made,
 * so the jars that are nearly out of time are visible before they become waste rather than
 * after.
 *
 * The shelf life sits here too, next to its own consequence. It used to live in Settings,
 * several screens from anything that showed what changing it would do.
 */
export function ProductExpiryStrip({ product }: { product: Product }) {
  const { entries, businessSettings, products } = useStore();
  const life = shelfLifeDays(businessSettings, product.id);
  const window = expiringWithinDays(businessSettings);
  const expiry = productExpiry(entries, product, life, window, new Date(), products);
  const bulk = bulkUnitFor(businessSettings, product);
  const shopSize = caseSize(businessSettings);
  const shopWord = caseWord(businessSettings);

  const soonest = expiry.lots[0];

  return (
    <div className="flex flex-col gap-1.5 border-t border-line/10 px-4 py-2.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-muted-foreground">Shelf life</span>
        <input
          type="text"
          inputMode="numeric"
          defaultValue={life}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const days = Number(e.target.value.trim());
            if (Number.isFinite(days) && days > 0 && days !== life) setShelfLifeDays(product.id, days);
            else e.target.value = String(life);
          }}
          className="h-6 w-14 rounded-md border border-input bg-transparent px-1.5 text-center text-[11px] tabular-nums"
          aria-label={`How many days ${product.name} keeps`}
        />
        <span className="text-muted-foreground">days</span>
      </div>

      {/* How this one leaves the shop. Blank means the shop default, because most products
          share it and only some do not. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-muted-foreground">Sold in</span>
        <input
          type="text"
          inputMode="numeric"
          defaultValue={product.bulkSize ?? ""}
          placeholder={String(shopSize)}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const n = Number(raw);
            updateProduct(product.id, { bulkSize: raw === "" ? null : Number.isFinite(n) && n > 1 ? Math.floor(n) : null });
          }}
          className="h-6 w-12 rounded-md border border-input bg-transparent px-1 text-center text-[11px] tabular-nums"
          aria-label={`How many per bulk unit of ${product.name}`}
        />
        <span className="text-muted-foreground">per</span>
        <input
          type="text"
          defaultValue={product.bulkWord ?? ""}
          placeholder={shopWord}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => updateProduct(product.id, { bulkWord: e.target.value.trim() || null })}
          className="h-6 w-20 rounded-md border border-input bg-transparent px-1.5 text-center text-[11px]"
          aria-label={`What a bulk unit of ${product.name} is called`}
        />
        <span className="text-muted-foreground">{`(now ${bulk.size} per ${bulk.word})`}</span>
      </div>

      {expiry.tracksAnything && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {expiry.expired > 0 && (
            <span className="font-semibold text-danger">{`${pluralize(expiry.expired, "jar")} past the date`}</span>
          )}
          {expiry.expiring > 0 && (
            <span className="font-semibold text-[#9A6B12]">
              {`${pluralize(expiry.expiring, "jar")} ${window === 0 ? "expiring today" : `expiring within ${pluralize(window, "day")}`}`}
            </span>
          )}
          {expiry.expired === 0 && expiry.expiring === 0 && (
            <span className="text-success">
              {soonest ? `All good — oldest lasts ${pluralize(soonest.daysLeft, "more day")}` : "All good"}
            </span>
          )}
          {expiry.unaccounted > 0 && (
            <span className="text-muted-foreground">{`${expiry.unaccounted} with no batch date`}</span>
          )}
        </div>
      )}
    </div>
  );
}
