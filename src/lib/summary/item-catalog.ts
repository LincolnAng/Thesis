/**
 * What can go in the "item" field of a transaction, and where each name comes from.
 *
 * The Products tab is the catalog of record: if a name isn't a card there, it isn't a
 * product. The transaction dropdown used to flatten products and raw materials into one
 * unlabelled list, so three products on the Products tab showed up as nine
 * indistinguishable names here — the owner had no way to tell a thing they sell from a
 * thing they buy, and a tenth phantom name appeared for any old row whose spelling drifted.
 *
 * So: the two lists stay separate and labelled, a sale can only be a product, and a name
 * that differs from the catalog only in case resolves to the catalog's spelling rather than
 * standing as its own option.
 */

import { productUnit } from "@/lib/units";
import { nameKey } from "./name-match";
import type { Entry, Product, RawMaterialStock } from "@/lib/store/types";

export interface CatalogItem {
  name: string;
  unit: string | null;
  kind: "product" | "material";
}

export interface ItemChoices {
  /** Finished goods, in the same order as the cards on the Products tab. */
  products: CatalogItem[];
  /** What the business buys. Empty for a sale — the shop doesn't sell its own ingredients. */
  materials: CatalogItem[];
  /**
   * The item already on this row when it matches nothing in the catalog. Offered so editing
   * an old entry can't silently blank what it says, but marked as the stray that it is.
   */
  unknown: string | null;
}

function productItems(products: Product[]): CatalogItem[] {
  return products.map((p) => ({ name: p.name, unit: productUnit(p), kind: "product" as const }));
}

function materialItems(rawMaterials: RawMaterialStock[]): CatalogItem[] {
  return rawMaterials.map((m) => ({ name: m.name, unit: m.unit?.trim() || null, kind: "material" as const }));
}

/** Which entry types can refer to something the business buys rather than sells. */
function allowsMaterials(type: Entry["type"]): boolean {
  return type !== "SALE";
}

/**
 * The catalog's own spelling of a name — so an entry saved as "cocoa beans" lines up with
 * the "Cocoa beans" row instead of looking like a separate item. Returns null for a name
 * the catalog has never heard of.
 */
export function canonicalItemName(
  name: string | null | undefined,
  products: Product[],
  rawMaterials: RawMaterialStock[],
): string | null {
  const key = nameKey(name);
  if (!key) return null;
  const product = products.find((p) => nameKey(p.name) === key);
  if (product) return product.name;
  return rawMaterials.find((m) => nameKey(m.name) === key)?.name ?? null;
}

/**
 * The unit the catalog knows for an item, so it's never asked for per transaction. Matched
 * case-insensitively for the same reason as {@link canonicalItemName}.
 */
export function unitForItem(
  name: string | null | undefined,
  products: Product[],
  rawMaterials: RawMaterialStock[],
): string | null {
  const key = nameKey(name);
  if (!key) return null;
  const product = products.find((p) => nameKey(p.name) === key);
  if (product) return productUnit(product);
  return rawMaterials.find((m) => nameKey(m.name) === key)?.unit?.trim() || null;
}

/** The product a name refers to, or null if it names a material (or nothing). */
export function productForItem(
  name: string | null | undefined,
  products: Product[],
): Product | null {
  const key = nameKey(name);
  if (!key) return null;
  return products.find((p) => nameKey(p.name) === key) ?? null;
}

export function itemChoices(
  type: Entry["type"],
  products: Product[],
  rawMaterials: RawMaterialStock[],
  current: string | null | undefined,
): ItemChoices {
  const productList = productItems(products);
  const materialList = allowsMaterials(type) ? materialItems(rawMaterials) : [];
  const offered = [...productList, ...materialList];
  const key = nameKey(current);
  const unknown = key && !offered.some((item) => nameKey(item.name) === key) ? (current as string) : null;
  return { products: productList, materials: materialList, unknown };
}

/**
 * What the dropdown should show as selected for a stored name: the catalog's spelling when
 * one matches, otherwise the stored value untouched. Reading it this way means a drifted
 * spelling displays correctly without rewriting the owner's row behind their back.
 */
export function selectedItemValue(
  current: string | null | undefined,
  choices: ItemChoices,
): string {
  const key = nameKey(current);
  if (!key) return "";
  const match = [...choices.products, ...choices.materials].find((item) => nameKey(item.name) === key);
  return match ? match.name : (current as string);
}
