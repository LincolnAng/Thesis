import type { Customer, Entry } from "@/lib/store/types";

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

/** A customer's sales, newest first. Matches by customerId when an entry has one (every
 * entry logged going forward), falling back to a normalized counterparty-name match for
 * historical entries logged before Customers existed — see the note on Entry.customerId. */
export function entriesForCustomer(customer: Customer, entries: Entry[]): Entry[] {
  const n = normalize(customer.name);
  return entries
    .filter((e) => e.type === "SALE")
    .filter((e) => (e.customerId ? e.customerId === customer.id : normalize(e.counterparty) === n))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export interface CustomerStats {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

export function customerStats(customer: Customer, entries: Entry[]): CustomerStats {
  const orders = entriesForCustomer(customer, entries);
  const totalSpent = orders.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  return { orderCount: orders.length, totalSpent, lastOrderAt: orders[0]?.timestamp ?? null };
}
