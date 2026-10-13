"use client";

import { useEffect } from "react";
import { addProduct, deleteProduct, setBusinessSetting } from "@/lib/store/store";
import { useStore } from "@/lib/store/use-store";
import { blankProduct } from "@/lib/store/blank-product";
import { fullName } from "@/lib/summary/product-sizes";
import type { Product } from "@/lib/store/types";

/**
 * The product list the owners settled on in the redesign, applied once.
 *
 * Adds the new products and retires the three spreads that came with the app as samples.
 * Runs the first time an executive opens Costing after the shop's real data has loaded —
 * never against the paint cache or the built-in samples, which would add duplicates or
 * "delete" rows that were never there — and marks itself done in Business Settings, so every
 * other device skips it and a product an owner later removes stays removed.
 *
 * New products arrive with no price and no recipe: those are the owners' figures to enter.
 * Retired products are soft-deleted (the sheet keeps the row, with a deletedAt date), and their
 * past sales stay in Transactions. A size is its own product pointing at its family head (see
 * summary/product-sizes), so heads are created first.
 */

const DONE_KEY = "catalog:redesign-2026-10";

interface PlannedProduct {
  family: string;
  size: string | null;
  unit: string;
}

export const NEW_PRODUCTS: PlannedProduct[] = [
  { family: "Cacao Tablea", size: "150g (12 pcs)", unit: "pack" },
  { family: "Cacao Tablea", size: "315g (25 pcs)", unit: "pack" },
  { family: "Tablea Ice Cream", size: "90g", unit: "cup" },
  { family: "Tablea Ice Cream", size: "390g", unit: "pint" },
  { family: "Ube Mango Biko", size: "Tub 400g", unit: "tub" },
  { family: "Ube Mango Biko", size: "Half Tray 700g", unit: "tray" },
  { family: "Ube Mango Biko", size: "Whole Tray 1400g", unit: "tray" },
  { family: "Brandy", size: null, unit: "bottle" },
];

export const RETIRED_PRODUCTS = ["Classic Cocoa Spread", "Dark Cocoa Spread", "Cocoa Crunch"];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const label = (p: PlannedProduct) => (p.size ? `${p.family} · ${p.size}` : p.family);

function applyCatalogUpdate(products: Product[]) {
  // Retire the sample spreads, sizes and all.
  const retired = new Set(RETIRED_PRODUCTS.map(norm));
  const heads = products.filter((p) => retired.has(norm(p.name)));
  const headIds = new Set(heads.map((p) => p.id));
  for (const p of products) if (headIds.has(p.id) || (p.sizeOfId && headIds.has(p.sizeOfId))) deleteProduct(p.id);
  let current = products.filter((p) => !headIds.has(p.id) && !(p.sizeOfId && headIds.has(p.sizeOfId)));

  // Add whatever of the new list isn't there yet, under any spelling of the same name.
  for (const planned of NEW_PRODUCTS) {
    if (current.some((p) => norm(fullName(p, current)) === norm(label(planned)))) continue;
    const head = current.find((p) => !p.sizeOfId && norm(p.name) === norm(planned.family));
    const made = addProduct(
      blankProduct(planned.family, {
        sizeLabel: planned.size,
        unit: planned.unit,
        ...(head && planned.size ? { sizeOfId: head.id } : {}),
      }),
    );
    current = [...current, made];
  }

  setBusinessSetting(DONE_KEY, new Date().toISOString());
}

let ranThisPage = false;

/** Call from the executive's Costing screen. Does nothing once the update has been applied. */
export function useCatalogUpdate(enabled: boolean) {
  const { products, businessSettings, loadedFromServer } = useStore();
  const done = Boolean(businessSettings[DONE_KEY]);
  useEffect(() => {
    if (!enabled || !loadedFromServer || done || ranThisPage) return;
    ranThisPage = true;
    applyCatalogUpdate(products);
  }, [enabled, loadedFromServer, done, products]);
}
