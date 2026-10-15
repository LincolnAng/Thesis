"use client";

import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { addProduct, updateProduct } from "@/lib/store/store";
import { useStore } from "@/lib/store/use-store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { expiringWithinDays, setShelfLifeDays, shelfLifeDays } from "@/lib/summary/business-config";
import { productExpiry } from "@/lib/summary/product-lots";
import { newSizeFrom, sizeName, type ProductFamily } from "@/lib/summary/product-sizes";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import { formatPeso, pluralize } from "@/lib/format";
import type { Product } from "@/lib/store/types";

/**
 * The Stock & sizes tab, as three plain blocks, each a heading and a few figures:
 *
 *   Stock      on hand · warn when below       (both typed in place) and whether it's running low
 *   Freshness  keeps for N days                 and what's past its date or about to be
 *   Sizes      one row per size: name, price, on hand — tap to open; add a size at the end
 */

const box = "h-10 w-20 rounded-lg border border-input bg-transparent px-2 text-center text-[15px] font-semibold tabular-nums outline-none focus:border-cacao";

export function StockPanel({ product, family, onOpenProduct }: { product: Product; family?: ProductFamily; onOpenProduct: (id: string) => void }) {
  const unit = (product.unit || "jar").replace(/s$/, "");
  return (
    <div className="flex flex-col divide-y divide-line/10">
      <StockBlock product={product} />
      <FreshnessBlock product={product} unit={unit} />
      {family && <SizesBlock product={product} family={family} onOpen={onOpenProduct} />}
    </div>
  );
}

function Block({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[15px] font-semibold">{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Pill({ tone, children }: { tone: "good" | "warn" | "bad"; children: React.ReactNode }) {
  const cls = tone === "good" ? "bg-success/10 text-success" : tone === "warn" ? "bg-[var(--status-warning)]/10 text-[var(--status-warning)]" : "bg-danger/10 text-danger";
  return <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${cls}`}>{children}</span>;
}

function Field({ label, suffix, children }: { label: string; suffix: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 text-[14px]">
        {children}
        <span className="text-muted-foreground">{suffix}</span>
      </span>
    </label>
  );
}

function StockBlock({ product }: { product: Product }) {
  const onHand = useNumericDraft(product.stockQty, (n) => updateProduct(product.id, { stockQty: n }));
  const warnAt = useNumericDraft(product.lowStockThreshold, (n) => updateProduct(product.id, { lowStockThreshold: n }));
  const low = product.lowStockThreshold > 0 && product.stockQty <= product.lowStockThreshold;
  const plural = product.unit || "jars";
  return (
    <Block
      title="Stock"
      aside={product.stockQty <= 0 ? <Pill tone="bad">Out of stock</Pill> : low ? <Pill tone="warn">Running low</Pill> : <Pill tone="good">In stock</Pill>}
    >
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <Field label="On hand" suffix={plural}>
          <input inputMode="numeric" aria-label={`${plural} on hand`} value={onHand.value} onChange={(e) => onHand.onChange(e.target.value.replace(/[^0-9.]/g, ""))} className={box} />
        </Field>
        <Field label="Warn me when below" suffix={plural}>
          <input inputMode="numeric" aria-label="Warn when below" value={warnAt.value} onChange={(e) => warnAt.onChange(e.target.value.replace(/[^0-9.]/g, ""))} className={box} />
        </Field>
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        Type a new number to correct the count. You&apos;ll get a low-stock warning once {plural} on hand drop to the number on the right.
      </p>
    </Block>
  );
}

function FreshnessBlock({ product, unit }: { product: Product; unit: string }) {
  const { entries, businessSettings, products } = useStore();
  const life = shelfLifeDays(businessSettings, product.id);
  const window = expiringWithinDays(businessSettings);
  const expiry = productExpiry(entries, product, life, window, new Date(), products);
  const [text, setText] = useState(String(life));
  const soonest = expiry.lots[0];

  function commit() {
    const days = Number(text.trim());
    if (Number.isFinite(days) && days > 0 && days !== life) setShelfLifeDays(product.id, days);
    else setText(String(life));
  }

  return (
    <Block
      title="Freshness"
      aside={
        expiry.expired > 0 ? (
          <Pill tone="bad">{pluralize(expiry.expired, unit)} past the date</Pill>
        ) : expiry.expiring > 0 ? (
          <Pill tone="warn">{pluralize(expiry.expiring, unit)} expiring soon</Pill>
        ) : expiry.tracksAnything ? (
          <Pill tone="good">All fresh</Pill>
        ) : null
      }
    >
      <Field label="Keeps for" suffix="days after it's made">
        <input inputMode="numeric" aria-label={`How many days ${product.name} keeps`} value={text} onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))} onBlur={commit} className={box} />
      </Field>
      {expiry.tracksAnything ? (
        <ul className="flex flex-col gap-1 text-[13.5px]">
          {expiry.expired > 0 && <li className="text-danger">{pluralize(expiry.expired, unit)} are past their date — log them as spoilage so stock stays true.</li>}
          {expiry.expiring > 0 && (
            <li className="text-[var(--status-warning)]">
              {pluralize(expiry.expiring, unit)} {window === 0 ? "expire today" : `expire within ${pluralize(window, "day")}`} — sell these first.
            </li>
          )}
          {expiry.expired === 0 && expiry.expiring === 0 && soonest && <li className="text-muted-foreground">The oldest batch is good for {pluralize(soonest.daysLeft, "more day")}.</li>}
          {expiry.unaccounted > 0 && <li className="text-muted-foreground">{expiry.unaccounted} on hand have no batch date, so their freshness isn&apos;t tracked.</li>}
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">Freshness is tracked from each batch you log as made.</p>
      )}
    </Block>
  );
}

function SizesBlock({ product, family, onOpen }: { product: Product; family: ProductFamily; onOpen: (id: string) => void }) {
  const ctx = useCostContext();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  function create() {
    const trimmed = label.trim();
    if (!trimmed) return;
    const made = addProduct(newSizeFrom(family.head, trimmed));
    setLabel("");
    setAdding(false);
    onOpen(made.id);
  }

  return (
    <Block
      title="Sizes"
      aside={
        !adding && (
          <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 text-[13px] font-semibold text-cacao">
            <Plus className="h-4 w-4" /> Add a size
          </button>
        )
      }
    >
      {family.all.length === 1 && !adding && <p className="text-[13px] text-muted-foreground">Only one size. Add another if you sell this in more than one size, like 100g and 250g.</p>}
      {family.all.length > 1 && (
        <ul className="flex flex-col overflow-hidden rounded-xl border border-line/15">
          {family.all.map((s) => {
            const current = s.id === product.id;
            const price = effectiveProductPrice(s, productCostPerJar(s, ctx));
            return (
              <li key={s.id} className="border-t border-line/10 first:border-t-0">
                <button
                  type="button"
                  onClick={() => !current && onOpen(s.id)}
                  aria-current={current ? "page" : undefined}
                  className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[14px] ${current ? "bg-cacao/[0.06]" : "hover:bg-secondary/50"}`}
                >
                  <span className="min-w-0 flex-1 font-medium">
                    {sizeName(s)}
                    {current && <span className="ml-2 text-[12px] font-semibold text-cacao">You&apos;re here</span>}
                  </span>
                  <span className="w-20 text-right tabular-nums">{price > 0 ? formatPeso(price) : <span className="text-[12.5px] text-muted-foreground">No price</span>}</span>
                  <span className="w-24 text-right text-[13px] text-muted-foreground tabular-nums">{pluralize(s.stockQty, (s.unit || "jar").replace(/s$/, ""))}</span>
                  <ChevronRight className={`h-4 w-4 shrink-0 ${current ? "invisible" : "text-muted-foreground"}`} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
        <div className="flex flex-col gap-2 rounded-xl bg-secondary/50 p-3">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="Name the size, e.g. 100g"
              className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-[14px] outline-none focus:border-cacao"
            />
            <button type="button" onClick={create} disabled={!label.trim()} className="h-10 rounded-lg bg-cacao px-4 text-[13px] font-semibold text-ivory disabled:opacity-40">
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className="h-10 px-2 text-[13px] font-semibold text-muted-foreground">
              Cancel
            </button>
          </div>
          <p className="text-[12.5px] text-muted-foreground">It starts with a copy of {family.head.name}&apos;s recipe and no stock. Change the amounts to match the new size.</p>
        </div>
      )}
    </Block>
  );
}
