"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { addProduct } from "@/lib/store/store";
import { newSizeFrom, sizeName } from "@/lib/summary/product-sizes";
import { formatPrice, pluralize } from "@/lib/format";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import type { Product } from "@/lib/store/types";

/**
 * The other sizes this product comes in.
 *
 * Each one is a full product underneath — its own recipe, price and shelf — so this is a way
 * in, not a summary. A new size copies the family's recipe as a starting point and arrives
 * with no stock, because inheriting jars would invent them.
 */
export function SizeStrip({
  head,
  sizes,
  onOpen,
}: {
  head: Product;
  sizes: Product[];
  onOpen: (id: string) => void;
}) {
  const ctx = useCostContext();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  function create() {
    const trimmed = label.trim();
    if (!trimmed) return;
    const made = addProduct(newSizeFrom(head, trimmed));
    setLabel("");
    setAdding(false);
    onOpen(made.id);
  }

  return (
    <div className="border-t border-line/10 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Sizes</span>
        {sizes.map((s) => {
          const cost = productCostPerJar(s, ctx);
          const price = effectiveProductPrice(s, cost);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpen(s.id)}
              title={`${sizeName(s)} — ${price > 0 ? formatPrice(price) : "no price yet"}, ${pluralize(s.stockQty, s.unit || "jar")} on the shelf`}
              className="rounded-full border border-line/20 px-2.5 py-1 text-[11px] font-semibold transition hover:border-cacao/40 hover:text-cacao"
            >
              {sizeName(s)}
              <span className="ml-1 font-normal text-muted-foreground">{price > 0 ? formatPrice(price) : "no price"}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 rounded-full border border-dashed border-line/25 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-cacao/40 hover:text-cacao"
        >
          <Plus className="h-3 w-3" /> Add a size
        </button>
      </div>

      {adding && (
        <div className="mt-2 flex items-center gap-2">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="e.g. 100g"
            className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-[12px] outline-none focus:border-cacao"
          />
          <button
            type="button"
            onClick={create}
            disabled={!label.trim()}
            className="rounded-lg bg-cacao px-2.5 py-1.5 text-[11px] font-semibold text-ivory disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      {adding && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          It starts with a copy of this recipe and no stock. Change the amounts so they match the new size.
        </p>
      )}
    </div>
  );
}
