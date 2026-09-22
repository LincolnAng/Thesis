import type { BusinessEvent, Entry } from "@/lib/store/types";

/**
 * Where a sale happened, derived rather than stored.
 *
 * An entry already carries the event it belongs to, and an event already knows whether it's
 * a one-off or an ongoing shop. Adding a separate `channel` field would create a second
 * source for the same fact — and a way for the two to disagree.
 */
export type SalesChannel = "direct" | "event" | "shop";

export const CHANNEL_LABELS: Record<SalesChannel, string> = {
  direct: "Direct",
  event: "Event",
  shop: "Shop",
};

export function channelOf(entry: Entry, events: BusinessEvent[]): SalesChannel {
  if (!entry.eventId) return "direct";
  const event = events.find((e) => e.id === entry.eventId);
  if (!event) return "direct";
  return event.kind === "distributor" ? "shop" : "event";
}

export interface ChannelRow {
  key: SalesChannel;
  label: string;
  qty: number;
  revenue: number;
  orders: number;
}

export function salesByChannel(entries: Entry[], events: BusinessEvent[]): ChannelRow[] {
  const totals = new Map<SalesChannel, ChannelRow>();
  for (const key of ["direct", "event", "shop"] as SalesChannel[]) {
    totals.set(key, { key, label: CHANNEL_LABELS[key], qty: 0, revenue: 0, orders: 0 });
  }
  for (const entry of entries) {
    if (entry.type !== "SALE") continue;
    const row = totals.get(channelOf(entry, events))!;
    row.qty += entry.quantity ?? 0;
    row.revenue += entry.amount ?? 0;
    row.orders += 1;
  }
  return [...totals.values()].filter((r) => r.orders > 0);
}
