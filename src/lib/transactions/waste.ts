import type { Entry } from "@/lib/store/types";

/**
 * Two kinds of loss, kept apart:
 *
 *   Spoilage  finished products lost — jars broken, past their date. Off the product's shelf,
 *             valued at what the product cost to make.
 *   Waste     raw materials and packaging lost — spilled beans, crushed jars, torn labels.
 *             Off the material's own stock. Its cost was already counted as an expense when
 *             it was bought, so it isn't taken off money earned a second time.
 *
 * Both are WASTE entries; waste carries this category.
 */
export const MATERIAL_WASTE = "material_waste";

export function isMaterialWaste(e: Pick<Entry, "type" | "category">): boolean {
  return e.type === "WASTE" && e.category === MATERIAL_WASTE;
}

export function isProductSpoilage(e: Pick<Entry, "type" | "category">): boolean {
  return e.type === "WASTE" && e.category !== MATERIAL_WASTE;
}

/**
 * Raw material used up in production outside a batch's recipe — raw cacao fed into the roaster
 * in a production run. A stock-out of the material (never of a product): it comes off the
 * material's shelf and counts as consumed, like a batch's draw.
 */
export const MATERIAL_USE = "material_use";

export function isMaterialUse(e: Pick<Entry, "type" | "category">): boolean {
  return e.type === "INVENTORY_OUT" && e.category === MATERIAL_USE;
}
