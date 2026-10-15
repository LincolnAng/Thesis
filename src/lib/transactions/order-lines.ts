import type { Entry, OrderLine } from "@/lib/store/types";

/**
 * A sale of several products is ONE transaction — one customer, one total, one payment — with
 * its products listed as order lines (Entry.lineItems), each at the price it sold for.
 *
 * Money is read from the transaction. Anything that counts products — best sellers, units sold,
 * forecasts, cost of goods — reads `expandOrderLines`, which turns each order into one line per
 * product so those calculations see the same shape they always have. Nothing is stored twice.
 *
 * Pure.
 */

export const lineSubtotal = (l: OrderLine) => Math.max(0, l.quantity) * Math.max(0, l.unitPrice);

export function orderTotal(lines: OrderLine[]): number {
  return Math.round(lines.reduce((s, l) => s + lineSubtotal(l), 0) * 100) / 100;
}

export function orderQuantity(lines: OrderLine[]): number {
  return lines.reduce((s, l) => s + Math.max(0, l.quantity), 0);
}

/** "Cacao Tablea · 150g ×5, Tablea Ice Cream · 90g ×3" — the order's products, for the Item column. */
export function describeOrder(lines: OrderLine[]): string {
  return lines.map((l) => `${l.name} ×${l.quantity}`).join(", ");
}

/** Units sold on a transaction: the order's total for multi-product sales, else its quantity. */
export function quantitySold(e: Pick<Entry, "type" | "quantity" | "lineItems">): number | null {
  if (e.type !== "SALE") return null;
  if (e.lineItems?.length) return orderQuantity(e.lineItems);
  return e.quantity;
}

/**
 * One entry per product for every multi-product sale; everything else passes through as is.
 * Each line's amount is its share of what the order actually came to, so per-product revenue
 * always adds back up to the transaction.
 */
export function expandOrderLines(entries: Entry[]): Entry[] {
  if (!entries.some((e) => e.lineItems?.length)) return entries;
  const out: Entry[] = [];
  for (const e of entries) {
    if (e.type !== "SALE" || !e.lineItems?.length) {
      out.push(e);
      continue;
    }
    const listed = orderTotal(e.lineItems);
    const actual = e.amount ?? listed;
    e.lineItems.forEach((line, i) => {
      const share = listed > 0 ? (lineSubtotal(line) / listed) * actual : 0;
      out.push({
        ...e,
        id: `${e.id}#${i}`,
        sku: line.name,
        quantity: line.quantity,
        amount: Math.round(share * 100) / 100,
        lineItems: null,
      });
    });
  }
  return out;
}
