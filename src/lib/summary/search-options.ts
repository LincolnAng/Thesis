import { familiesOf, fullName } from "@/lib/summary/product-sizes";
import type { Product, RawMaterialStock } from "@/lib/store/types";
import type { SearchOption } from "@/components/ui/search-select";

/**
 * The long lists the app picks from, as options for SearchSelect: every product and size the way
 * Inventory lists them (a family with several sizes grouped under its name), and the materials.
 */

export function productOptions(products: Product[]): SearchOption[] {
  return familiesOf(products)
    .sort((a, b) => a.head.name.localeCompare(b.head.name))
    .flatMap(({ head, all }) => all.map((p) => ({ value: p.id, label: fullName(p, products), group: all.length > 1 ? head.name : undefined })));
}

/** Materials by name; with `grouped`, ingredients first and packaging after, under headings. */
export function materialOptions(materials: RawMaterialStock[], grouped = false): SearchOption[] {
  const sorted = [...materials].sort((a, b) => a.name.localeCompare(b.name));
  if (!grouped) return sorted.map((m) => ({ value: m.id, label: m.name, hint: m.unit }));
  return [
    ...sorted.filter((m) => m.kind !== "packaging").map((m) => ({ value: m.id, label: m.name, hint: m.unit, group: "Ingredients" })),
    ...sorted.filter((m) => m.kind === "packaging").map((m) => ({ value: m.id, label: m.name, hint: m.unit, group: "Packaging" })),
  ];
}
