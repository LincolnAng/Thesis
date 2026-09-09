import type { BusinessEvent, Entry, EventStockMovement, Product } from "@/lib/store/types";

/**
 * What an event or distributor is currently holding, and what it has sold.
 *
 * Nothing here is stored. Holdings are always recomputed from the borrow/return movements
 * plus the sales tagged to the event, so the number on screen can't drift away from the
 * rows it came from — the only way to change it is to record another movement or sale.
 */
export interface EventProductHolding {
  productId: string;
  productName: string;
  borrowed: number;
  returned: number;
  sold: number;
  /** Wasted or otherwise taken out at the event without a sale. */
  lost: number;
  /** borrowed − returned − sold − lost. Never negative on screen, but see `oversold`. */
  onHand: number;
  /** True when the event moved more stock than it ever borrowed — a sign of a miscount
   * or a sale logged against the wrong event, worth surfacing rather than hiding. */
  oversold: boolean;
  revenue: number;
}

export interface EventSummary {
  event: BusinessEvent;
  holdings: EventProductHolding[];
  /** Units still physically at the event, across all products. */
  totalOnHand: number;
  totalSold: number;
  revenue: number;
  lastActivityAt: string | null;
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

/** Entries name products by free text, movements by id — this bridges the two the same
 * way the store's own sku resolver does. */
function resolveProductId(products: Product[], sku: string | null): string | null {
  if (!sku) return null;
  const n = normalize(sku);
  const match =
    products.find((p) => normalize(p.name) === n) ??
    products.find((p) => normalize(p.name).includes(n) || n.includes(normalize(p.name)));
  return match?.id ?? null;
}

export function summarizeEvent(
  event: BusinessEvent,
  movements: EventStockMovement[],
  entries: Entry[],
  products: Product[],
): EventSummary {
  const byProduct = new Map<string, EventProductHolding>();
  let lastActivityAt: string | null = null;

  function slot(productId: string): EventProductHolding {
    const existing = byProduct.get(productId);
    if (existing) return existing;
    const created: EventProductHolding = {
      productId,
      productName: products.find((p) => p.id === productId)?.name ?? "Unknown product",
      borrowed: 0,
      returned: 0,
      sold: 0,
      lost: 0,
      onHand: 0,
      oversold: false,
      revenue: 0,
    };
    byProduct.set(productId, created);
    return created;
  }

  function noteActivity(at: string | null | undefined) {
    if (at && (!lastActivityAt || at > lastActivityAt)) lastActivityAt = at;
  }

  for (const m of movements) {
    if (m.eventId !== event.id) continue;
    const row = slot(m.productId);
    if (m.type === "borrow") row.borrowed += m.quantity;
    else row.returned += m.quantity;
    noteActivity(m.createdAt);
  }

  for (const e of entries) {
    if (e.eventId !== event.id) continue;
    const productId = resolveProductId(products, e.sku);
    if (e.type === "SALE") {
      // A sale with no recognizable product still counts toward revenue — the money came in
      // even if the line can't be attributed to a specific product's holdings.
      if (productId) {
        const row = slot(productId);
        row.sold += e.quantity ?? 0;
        row.revenue += e.amount ?? 0;
      }
      noteActivity(e.timestamp);
    } else if (e.type === "WASTE" || e.type === "INVENTORY_OUT") {
      if (productId) slot(productId).lost += e.quantity ?? 0;
      noteActivity(e.timestamp);
    }
  }

  const holdings = [...byProduct.values()].map((row) => {
    const net = row.borrowed - row.returned - row.sold - row.lost;
    return { ...row, onHand: Math.max(0, net), oversold: net < 0 };
  });
  holdings.sort((a, b) => b.onHand - a.onHand || a.productName.localeCompare(b.productName));

  // Sales that couldn't be matched to a product are still this event's revenue.
  const revenue = entries
    .filter((e) => e.eventId === event.id && e.type === "SALE")
    .reduce((sum, e) => sum + (e.amount ?? 0), 0);

  return {
    event,
    holdings,
    totalOnHand: holdings.reduce((sum, h) => sum + h.onHand, 0),
    totalSold: holdings.reduce((sum, h) => sum + h.sold, 0),
    revenue,
    lastActivityAt,
  };
}

export function summarizeEvents(
  events: BusinessEvent[],
  movements: EventStockMovement[],
  entries: Entry[],
  products: Product[],
): EventSummary[] {
  return events
    .map((event) => summarizeEvent(event, movements, entries, products))
    .sort((a, b) => {
      // Open channels first — those are the ones still holding stock and needing attention.
      if (a.event.status !== b.event.status) return a.event.status === "open" ? -1 : 1;
      return (b.lastActivityAt ?? b.event.createdAt).localeCompare(a.lastActivityAt ?? a.event.createdAt);
    });
}

/** How much of a product is free to borrow right now — what's in main inventory. */
export function availableToBorrow(product: Product): number {
  return Math.max(0, product.stockQty);
}
