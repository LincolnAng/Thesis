import type { Allocation, Entry } from "@/lib/store/types";

const STOCK_OUT_TYPES = new Set<Entry["type"]>(["SALE", "INVENTORY_OUT", "WASTE"]);

export interface AllocationStats {
  used: number;
  remaining: number;
}

/** "Used" is the sum of every entry tagged with this allocation's id that actually removed
 * stock (a sale, a manual stock-out, or waste) — this is computed fresh from the entries
 * every time, never stored on the Allocation itself, so it can never drift out of sync. */
export function allocationStats(allocation: Allocation, entries: Entry[]): AllocationStats {
  const used = entries
    .filter((e) => e.allocationId === allocation.id && STOCK_OUT_TYPES.has(e.type))
    .reduce((sum, e) => sum + (e.quantity ?? 0), 0);
  return { used, remaining: Math.max(0, allocation.allocatedQty - used) };
}
