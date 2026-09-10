import { Bean, Candy, Cookie, Droplet, Milk, Package, Wheat, type LucideIcon } from "lucide-react";

/**
 * Picks an icon from an item's own name, so the inventory list reads at a glance without
 * every row spelling out what it is. Keyword-matched rather than a stored field — the owner
 * types ingredient names freely and shouldn't have to pick an icon for each one.
 */
type ItemIconKey = "packaging" | "cocoa" | "liquid" | "sweet" | "dairy" | "product" | "other";

const ICONS: Record<ItemIconKey, LucideIcon> = {
  packaging: Package,
  cocoa: Bean,
  liquid: Droplet,
  sweet: Candy,
  dairy: Milk,
  product: Cookie,
  other: Wheat,
};

const KEY_PATTERNS: Array<[RegExp, ItemIconKey]> = [
  [/jar|bottle|tub|cup|lid|label|box|pack|sachet|tray|wrap/i, "packaging"],
  // Finished goods first: in a cocoa business every product name contains "cocoa", so
  // matching that keyword earlier would give the whole catalogue one identical icon.
  [/spread|crunch|cookie|biscuit|bar|mix/i, "product"],
  [/cocoa|bean|nut|peanut|cashew|coffee/i, "cocoa"],
  [/oil|butter|water|syrup|honey/i, "liquid"],
  [/sugar|salt|candy|sweet/i, "sweet"],
  [/milk|cream|dairy/i, "dairy"],
];

export function itemIconKey(name: string): ItemIconKey {
  for (const [pattern, key] of KEY_PATTERNS) {
    if (pattern.test(name)) return key;
  }
  return "other";
}

export function iconForItemName(name: string): LucideIcon {
  return ICONS[itemIconKey(name)];
}

export function ItemIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[itemIconKey(name)];
  return <Icon className={className} />;
}
