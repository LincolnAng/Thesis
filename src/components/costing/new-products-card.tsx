"use client";

import { useState } from "react";
import { addProduct, setBusinessSetting } from "@/lib/store/store";
import { useStore } from "@/lib/store/use-store";
import { blankProduct } from "@/lib/store/blank-product";
import { fullName } from "@/lib/summary/product-sizes";
import type { Product } from "@/lib/store/types";

/**
 * The product list the owners settled on in the redesign, offered once to an executive.
 *
 * Added through the app, not by a script, so nothing appears in the shop's sheet until an
 * owner says so — and one at a time if they like, because a product they already have under
 * another name should be left alone rather than duplicated. Each arrives with no price and no
 * recipe: those are the owners' figures to enter, and inventing them would put made-up costs
 * behind every margin on the page.
 *
 * A size is its own product pointing at its family head (see summary/product-sizes), so the
 * families are created head first.
 */

interface PlannedProduct {
  family: string;
  size: string | null;
  unit: string;
}

const NEW_PRODUCTS: PlannedProduct[] = [
  { family: "Cacao Tablea", size: "150g (12 pcs)", unit: "pack" },
  { family: "Cacao Tablea", size: "315g (25 pcs)", unit: "pack" },
  { family: "Tablea Ice Cream", size: "90g", unit: "cup" },
  { family: "Tablea Ice Cream", size: "390g", unit: "pint" },
  { family: "Ube Mango Biko", size: "Tub 400g", unit: "tub" },
  { family: "Ube Mango Biko", size: "Half Tray 700g", unit: "tray" },
  { family: "Ube Mango Biko", size: "Whole Tray 1400g", unit: "tray" },
  { family: "Brandy", size: null, unit: "bottle" },
];

const DISMISSED_KEY = "costing:newProductsDismissed";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const label = (p: PlannedProduct) => (p.size ? `${p.family} · ${p.size}` : p.family);

function existing(planned: PlannedProduct, products: Product[]): boolean {
  const want = norm(label(planned));
  return products.some((p) => norm(fullName(p, products)) === want);
}

/** Adds one planned product, creating its family head first if the family isn't there yet. */
function addPlanned(planned: PlannedProduct, products: Product[]): Product {
  const head = products.find((p) => !p.sizeOfId && norm(p.name) === norm(planned.family));
  if (!head || !planned.size) {
    return addProduct(blankProduct(planned.family, { sizeLabel: planned.size, unit: planned.unit }));
  }
  return addProduct(blankProduct(planned.family, { sizeLabel: planned.size, sizeOfId: head.id, unit: planned.unit }));
}

export function NewProductsCard() {
  const { products, businessSettings } = useStore();
  const [busy, setBusy] = useState(false);
  if (businessSettings[DISMISSED_KEY] === "true") return null;

  const missing = NEW_PRODUCTS.filter((p) => !existing(p, products));
  if (missing.length === 0) return null;

  function addAll() {
    setBusy(true);
    // Each add sees the products added before it, so sizes find the head made a moment ago.
    let current = products;
    for (const planned of missing) current = [...current, addPlanned(planned, current)];
    setBusy(false);
  }

  return (
    <div className="mb-5 rounded-2xl border border-cacao/30 bg-cacao/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[17px] font-semibold">New products to add</div>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            From the new product list. Each is added with no price and no recipe — you fill those in. Skip any you
            already have under another name.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={addAll}
            className="min-h-11 rounded-[10px] bg-cacao px-4 text-[13px] font-semibold text-ivory disabled:opacity-50"
          >
            Add all {missing.length}
          </button>
          <button
            type="button"
            onClick={() => setBusinessSetting(DISMISSED_KEY, "true")}
            className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[13px] font-semibold"
          >
            Not now
          </button>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {missing.map((planned) => (
          <li key={label(planned)}>
            <button
              type="button"
              onClick={() => addPlanned(planned, products)}
              className="min-h-11 rounded-full border border-line/20 bg-card px-3.5 text-[13px] font-medium transition hover:border-cacao/40 hover:text-cacao"
              title="Add just this one"
            >
              + {label(planned)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
