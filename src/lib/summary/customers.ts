import type { Entry } from "@/lib/store/types";

/**
 * Customers aren't a separate thing the owner maintains — they're derived from the buyer
 * name already recorded on every sale, so the list is always complete and never drifts out
 * of sync with the sales history.
 */
export interface CustomerPurchase {
  sku: string;
  quantity: number;
  unit: string | null;
  spent: number;
  orders: number;
}

export interface DerivedCustomer {
  /** Case/space-insensitive identity. "Aling Nena", "aling nena" and "Aling  Nena" share one. */
  key: string;
  /** The spelling the owner used most often — what gets displayed. */
  name: string;
  /** Every distinct spelling seen, so near-duplicates are visible rather than hidden. */
  spellings: string[];
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  firstOrderAt: string | null;
  purchases: CustomerPurchase[];
}

/** Lowercased, whitespace-collapsed — capitalization or a double space never splits one
 * customer into two. */
export function customerKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Higher is tidier. Used only to break ties between equally-common spellings of one name. */
function tidinessScore(spelling: string): number {
  let score = 0;
  if (!/\s{2,}/.test(spelling)) score += 2; // no doubled-up spaces
  if (/^[A-Z]/.test(spelling)) score += 2; // starts capitalized, like a name
  if (spelling !== spelling.toUpperCase()) score += 1; // not SHOUTED
  return score;
}

export function deriveCustomers(entries: Entry[]): DerivedCustomer[] {
  const sales = entries.filter((e) => e.type === "SALE" && customerKey(e.counterparty) !== "");
  const groups = new Map<string, Entry[]>();
  for (const entry of sales) {
    const key = customerKey(entry.counterparty);
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  const customers: DerivedCustomer[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Display the spelling used most often. Ties are common (three sales, three different
    // capitalizations), and picking arbitrarily can surface the ugliest one — "Aling  Nena"
    // with a stray double space — so ties fall back to whichever spelling is tidiest.
    const spellingCounts = new Map<string, number>();
    for (const e of sorted) {
      const raw = (e.counterparty ?? "").trim();
      if (raw) spellingCounts.set(raw, (spellingCounts.get(raw) ?? 0) + 1);
    }
    const spellings = [...spellingCounts.keys()];
    const name =
      [...spellings]
        .sort(
          (a, b) =>
            (spellingCounts.get(b) ?? 0) - (spellingCounts.get(a) ?? 0) || tidinessScore(b) - tidinessScore(a),
        )
        .at(0) ?? "";

    const bySku = new Map<string, CustomerPurchase>();
    for (const e of group) {
      const sku = e.sku?.trim() || "Unspecified item";
      const existing = bySku.get(sku);
      if (existing) {
        existing.quantity += e.quantity ?? 0;
        existing.spent += e.amount ?? 0;
        existing.orders += 1;
        existing.unit = existing.unit ?? e.unit;
      } else {
        bySku.set(sku, { sku, quantity: e.quantity ?? 0, unit: e.unit, spent: e.amount ?? 0, orders: 1 });
      }
    }

    customers.push({
      key,
      name,
      spellings,
      orderCount: group.length,
      totalSpent: group.reduce((sum, e) => sum + (e.amount ?? 0), 0),
      lastOrderAt: sorted[0]?.timestamp ?? null,
      firstOrderAt: sorted[sorted.length - 1]?.timestamp ?? null,
      purchases: [...bySku.values()].sort((a, b) => b.spent - a.spent),
    });
  }

  return customers.sort((a, b) => b.totalSpent - a.totalSpent);
}

export function entriesForCustomer(key: string, entries: Entry[]): Entry[] {
  return entries
    .filter((e) => e.type === "SALE" && customerKey(e.counterparty) === key)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/** Small edit distance, capped — enough to catch "Aling Nena" vs "Aling Nina". */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = temp;
    }
  }
  return prev[b.length];
}

/**
 * Existing customers whose name resembles what's being typed, best match first — the guard
 * against creating "Aling Nina" when "Aling Nena" already exists. An empty query returns the
 * most valuable customers, so the dropdown is useful before typing anything.
 */
export function suggestCustomers(query: string, customers: DerivedCustomer[], limit = 6): DerivedCustomer[] {
  const q = customerKey(query);
  if (!q) return customers.slice(0, limit);

  return customers
    .map((customer) => {
      const key = customer.key;
      let score = Infinity;
      if (key === q) score = 0;
      else if (key.startsWith(q)) score = 1;
      else if (key.includes(q)) score = 2;
      else {
        const distance = editDistance(q, key);
        // Allow roughly one typo per 4 characters, so short names don't match everything.
        if (distance <= Math.max(1, Math.floor(q.length / 4))) score = 3 + distance;
        else if (key.split(" ").some((word) => word.startsWith(q))) score = 6;
      }
      return { customer, score };
    })
    .filter((r) => r.score !== Infinity)
    .sort((a, b) => a.score - b.score || b.customer.totalSpent - a.customer.totalSpent)
    .slice(0, limit)
    .map((r) => r.customer);
}
