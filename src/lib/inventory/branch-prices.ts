import { mainBranch, type Branch } from "@/lib/inventory/branches";

/**
 * Selling prices at a branch other than the main one. Manila's are higher, because shipping
 * there (freight) adds to what each unit costs. Kept as business settings:
 *
 *   branchFreight:<productId>:<branchId>   freight per unit, ₱ — Executives only (a cost)
 *   branchPrice:<productId>:<branchId>     selling price there — everyone sees it, so a sale
 *                                          recorded at that branch starts at the right price
 *
 * A product with no price set for a branch sells at its main price there.
 */
export const freightKey = (productId: string, branchId: string) => `branchFreight:${productId}:${branchId}`;
export const branchPriceKey = (productId: string, branchId: string) => `branchPrice:${productId}:${branchId}`;

const num = (s: string | undefined) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function freightPerUnit(settings: Record<string, string>, productId: string, branchId: string): number {
  return num(settings[freightKey(productId, branchId)]) ?? 0;
}

export function branchPrice(settings: Record<string, string>, productId: string, branchId: string): number | null {
  return num(settings[branchPriceKey(productId, branchId)]);
}

/** What a product sells for at a branch: its price there if one is set, else its main price. */
export function priceAtBranch(settings: Record<string, string>, branches: Branch[], productId: string, branchId: string | null | undefined, mainPrice: number): number {
  if (!branchId || branchId === mainBranch(branches).id) return mainPrice;
  return branchPrice(settings, productId, branchId) ?? mainPrice;
}
