import type { Entry, Product, StockTransfer } from "@/lib/store/types";
import { findProduct } from "@/lib/summary/product-match";

/**
 * The shop's branches — CDO and Manila to begin with, more (in other countries too) added on
 * Inventory — and how much of each product is at each.
 *
 * Only the total is stored (the product's stock, which every sale, batch and loss already moves).
 * What is at each branch is worked out from the records: stock moved between branches, and
 * the sales, batches and losses recorded at each. Whatever isn't at another branch is at the
 * main branch (the first in the list), so nothing recorded before branches existed goes missing.
 * Pure (branches.test.ts).
 */

export interface Branch {
  id: string;
  name: string;
  country: string;
}

export const BRANCHES_KEY = "branches";

export const DEFAULT_BRANCHES: Branch[] = [
  { id: "cdo", name: "CDO", country: "Philippines" },
  { id: "manila", name: "Manila", country: "Philippines" },
];

export function branchesOf(settings: Record<string, string>): Branch[] {
  try {
    const raw = JSON.parse(settings[BRANCHES_KEY] ?? "null");
    if (Array.isArray(raw) && raw.length > 0) {
      const ok = raw.filter((b) => b && typeof b.id === "string" && typeof b.name === "string");
      if (ok.length) return ok.map((b) => ({ id: b.id, name: b.name, country: b.country || "Philippines" }));
    }
  } catch {
    // fall through to the defaults
  }
  return DEFAULT_BRANCHES;
}

export const mainBranch = (branches: Branch[]) => branches[0];

/** The branch an entry happened at; blank or unknown means the main branch. */
export function branchOf(e: Pick<Entry, "branch">, branches: Branch[]): string {
  return e.branch && branches.some((b) => b.id === e.branch) ? e.branch : mainBranch(branches).id;
}

/** How each entry moves one product's stock at its branch: + in, − out. */
function movement(e: Entry, product: Product, products: Product[]): number {
  if (e.eventId) return 0; // event stock was already moved out when it was sent
  if (e.type === "SALE" && e.lineItems?.length) {
    return -e.lineItems
      .filter((l) => (l.productId ? l.productId === product.id : findProduct(products, l.name)?.id === product.id))
      .reduce((n, l) => n + (l.quantity || 0), 0);
  }
  if (!e.quantity) return 0;
  const isThis = findProduct(products, e.sku)?.id === product.id;
  if (!isThis) return 0;
  if (e.type === "INVENTORY_IN") return e.quantity;
  if (e.type === "SALE" || e.type === "INVENTORY_OUT" || (e.type === "WASTE" && e.category !== "material_waste")) return -e.quantity;
  return 0;
}

/** One product's stock at every branch. The main branch holds whatever isn't elsewhere. */
export function stockByBranch(product: Product, products: Product[], entries: Entry[], transfers: StockTransfer[], branches: Branch[]): Record<string, number> {
  const main = mainBranch(branches).id;
  const out: Record<string, number> = Object.fromEntries(branches.map((b) => [b.id, 0]));
  for (const t of transfers) {
    if (t.productId !== product.id) continue;
    if (t.toBranch !== main && t.toBranch in out) out[t.toBranch] += t.quantity;
    if (t.fromBranch !== main && t.fromBranch in out) out[t.fromBranch] -= t.quantity;
  }
  for (const e of entries) {
    const at = branchOf(e, branches);
    if (at === main) continue;
    out[at] += movement(e, product, products);
  }
  let elsewhere = 0;
  for (const b of branches) {
    if (b.id === main) continue;
    out[b.id] = Math.max(0, Math.round(out[b.id] * 100) / 100);
    elsewhere += out[b.id];
  }
  out[main] = Math.max(0, Math.round((product.stockQty - elsewhere) * 100) / 100);
  return out;
}

export function newBranchId(name: string, existing: Branch[]): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "branch";
  let id = base;
  for (let i = 2; existing.some((b) => b.id === id); i++) id = `${base}-${i}`;
  return id;
}
