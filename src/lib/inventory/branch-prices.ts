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

/**
 * What a product should sell for at a branch with freight, as two suggestions (never set on its
 * own): the main price plus the freight, so each unit earns the same pesos; and — when the cost
 * is known — the price that keeps the same margin percent on the higher landed cost. Rounded up
 * to the next peso.
 */
export function recommendedBranchPrices(mainPrice: number, unitCost: number | null, freight: number): { sameProfit: number; sameMargin: number | null } {
  const sameProfit = Math.ceil(mainPrice + freight);
  if (unitCost == null || mainPrice <= 0 || unitCost >= mainPrice) return { sameProfit, sameMargin: null };
  const margin = (mainPrice - unitCost) / mainPrice;
  return { sameProfit, sameMargin: Math.ceil((unitCost + freight) / (1 - margin)) };
}

/** A branch's price for a sale: the price set there, else the main price plus freight (a suggestion). */
export function suggestedPriceAtBranch(settings: Record<string, string>, branches: Branch[], productId: string, branchId: string | null | undefined, mainPrice: number): number {
  if (!branchId || branchId === mainBranch(branches).id) return mainPrice;
  return branchPrice(settings, productId, branchId) ?? Math.ceil(mainPrice + freightPerUnit(settings, productId, branchId));
}
