/**
 * Raw cacao loses weight to roasting, shelling and winnowing before it's usable. Recipes are
 * written in usable cacao, so buying and costing have to scale back up to raw by the
 * utilization rate: 1 kg usable at 70% utilization means 1.43 kg raw bought and paid for.
 */

/** The raw material the utilization rate applies to — cacao/cocoa beans or nibs. */
export function isRawCacao(name: string): boolean {
  return /\b(cacao|cocoa)\b/i.test(name) && /\b(bean|beans|raw|nib|nibs)\b/i.test(name);
}

/** Raw quantity needed to end up with `usableQty` of this material. `utilization` is 0–1. */
export function rawQuantityNeeded(materialName: string, usableQty: number, utilization: number): number {
  if (!isRawCacao(materialName)) return usableQty;
  return usableQty / Math.min(1, Math.max(0.01, utilization));
}
