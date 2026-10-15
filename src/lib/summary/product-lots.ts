/**
 * Jars grouped by the day they were made, so the app can tell fresh stock from old.
 *
 * Stock was one number per product. A number cannot go off: forty jars read the same whether
 * they were made last week or last winter, so nothing could warn her that half the shelf was
 * about to become waste, and the forecast happily counted two years of cover in jars that
 * keep for three months.
 *
 * Every batch she logs already carries the day it was made. Sales, spoilage and stock sent to
 * events draw that down oldest-first, which is both what a kitchen does and the only order
 * that makes an expiry date mean anything. What is left is a set of lots, each with its own
 * made-on date and its own deadline.
 *
 * Pure: no store, no React.
 */

import type { Entry, Product } from "@/lib/store/types";

export interface StockLot {
  /** Day the batch was made, "YYYY-MM-DD". */
  madeOn: string;
  /** Day it stops being sellable. */
  expiresOn: string;
  qty: number;
  /** Negative once past. */
  daysLeft: number;
}

export type LotState = "expired" | "expiring" | "fresh";

export interface ProductExpiry {
  lots: StockLot[];
  /** Jars already past their date. */
  expired: number;
  /** Jars due within the warning window she set. */
  expiring: number;
  fresh: number;
  /** Everything the lots account for. May differ from the stored stockQty — see `unaccounted`. */
  tracked: number;
  /**
   * Stored stock the batch records cannot explain: jars on the shelf before she started
   * logging batches, or logged without a date. Reported rather than folded in, because a lot
   * with an invented made-on date would get an invented expiry date too.
   */
  unaccounted: number;
  /** False when no batch has ever been logged, so nothing here is worth showing. */
  tracksAnything: boolean;
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, (d ?? 1) + n);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function matches(entry: Entry, product: Product): boolean {
  return (entry.sku ?? "").trim().toLowerCase() === product.name.trim().toLowerCase();
}

/**
 * What is left of each batch, oldest first.
 *
 * Draws sales, spoilage and event movements off the front. Stock sent to an event has left
 * the shelf even though it may come back, and when it comes back it is logged as its own
 * movement — so counting it out here and in again later is the honest reading.
 */
export function productExpiry(
  entries: Entry[],
  product: Product,
  shelfLifeDays: number,
  expiringWithinDays: number,
  today = new Date(),
  /** Every product, so batches of things made FROM this one (tablea into ice cream) draw it down. */
  allProducts: Product[] = [],
): ProductExpiry {
  const todayDay = dayOf(today.toISOString());

  const made = entries
    .filter((e) => e.type === "INVENTORY_IN" && e.quantity && e.quantity > 0 && matches(e, product))
    .map((e) => ({ day: dayOf(e.timestamp), qty: e.quantity as number }))
    .sort((a, b) => a.day.localeCompare(b.day));

  if (made.length === 0) {
    return {
      lots: [],
      expired: 0,
      expiring: 0,
      fresh: 0,
      tracked: 0,
      unaccounted: Math.max(0, product.stockQty),
      tracksAnything: false,
    };
  }

  let out = entries
    .filter(
      (e) =>
        (e.type === "SALE" || e.type === "WASTE" || e.type === "INVENTORY_OUT") &&
        e.quantity &&
        e.quantity > 0 &&
        matches(e, product),
    )
    .reduce((sum, e) => sum + (e.quantity as number), 0);
  // Used as an in-house component: each batch of a product that contains this one took some.
  for (const parent of allProducts) {
    const row = (parent.recipeComponents ?? []).find((c) => c.productId === product.id);
    if (!row || parent.id === product.id || parent.batchYield <= 0) continue;
    for (const e of entries) {
      if (e.type !== "INVENTORY_IN" || !e.quantity || e.quantity <= 0 || !matches(e, parent)) continue;
      out += (e.quantity / parent.batchYield) * row.quantity;
    }
  }

  const lots: StockLot[] = [];
  for (const batch of made) {
    let left = batch.qty;
    if (out > 0) {
      const taken = Math.min(out, left);
      out -= taken;
      left -= taken;
    }
    if (left <= 0) continue;
    const expiresOn = addDays(batch.day, Math.max(0, shelfLifeDays));
    lots.push({ madeOn: batch.day, expiresOn, qty: left, daysLeft: daysBetween(todayDay, expiresOn) });
  }

  const window = Math.max(0, expiringWithinDays);
  let expired = 0;
  let expiring = 0;
  let fresh = 0;
  for (const lot of lots) {
    if (lot.daysLeft < 0) expired += lot.qty;
    else if (lot.daysLeft <= window) expiring += lot.qty;
    else fresh += lot.qty;
  }

  const tracked = lots.reduce((sum, l) => sum + l.qty, 0);
  return {
    lots,
    expired,
    expiring,
    fresh,
    tracked,
    unaccounted: Math.max(0, Math.round((product.stockQty - tracked) * 100) / 100),
    tracksAnything: true,
  };
}

export function lotState(lot: StockLot, expiringWithinDays: number): LotState {
  if (lot.daysLeft < 0) return "expired";
  return lot.daysLeft <= Math.max(0, expiringWithinDays) ? "expiring" : "fresh";
}

/**
 * Stock that will still be good when it is needed.
 *
 * The forecast asks "do I need to make more?", and jars that will have expired by then are
 * not an answer to it. Counting them was how a shelf of old stock hid a shortage.
 */
export function sellableBy(expiry: ProductExpiry, day: string): number {
  const fromLots = expiry.lots.filter((l) => l.expiresOn >= day).reduce((sum, l) => sum + l.qty, 0);
  // Stock with no batch record has no date either; it is counted, because refusing to count
  // it would understate the shelf for anyone who started logging mid-life.
  return fromLots + expiry.unaccounted;
}
