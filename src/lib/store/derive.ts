import type { Entry } from "./types";

export function isWithinDays(iso: string, days: number, now: Date = new Date()): boolean {
  const t = new Date(iso).getTime();
  return now.getTime() - t <= days * 24 * 60 * 60 * 1000;
}

export function salesEntries(entries: Entry[]): Entry[] {
  return entries.filter((e) => e.type === "SALE");
}

export function expenseEntries(entries: Entry[]): Entry[] {
  return entries.filter((e) => e.type === "EXPENSE");
}

export function wasteEntries(entries: Entry[]): Entry[] {
  return entries.filter((e) => e.type === "WASTE");
}

export function totalRevenue(entries: Entry[]): number {
  return salesEntries(entries).reduce((sum, e) => sum + (e.amount ?? 0), 0);
}

export function totalExpenses(entries: Entry[]): number {
  return expenseEntries(entries).reduce((sum, e) => sum + (e.amount ?? 0), 0);
}

export function totalWasteValue(entries: Entry[]): number {
  return wasteEntries(entries).reduce((sum, e) => sum + (e.amount ?? 0), 0);
}

export function revenueBySku(entries: Entry[]): { sku: string; revenue: number; qty: number }[] {
  const map = new Map<string, { sku: string; revenue: number; qty: number }>();
  for (const e of salesEntries(entries)) {
    const key = e.sku ?? "Unspecified";
    const existing = map.get(key) ?? { sku: key, revenue: 0, qty: 0 };
    existing.revenue += e.amount ?? 0;
    existing.qty += e.quantity ?? 0;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export function expensesByCategory(entries: Entry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of expenseEntries(entries)) {
    const key = e.category ?? "misc";
    out[key] = (out[key] ?? 0) + (e.amount ?? 0);
  }
  return out;
}
