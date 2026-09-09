import { formatPeso } from "@/lib/format";
import { EXPENSE_CATEGORY_LABELS, ENTRY_TYPE_LABELS, PRICE_TYPE_LABELS } from "@/lib/format";
import type { Entry, Product, ProductVariant, RawMaterialStock } from "@/lib/store/types";

export type EntryDraft = Omit<Entry, "id">;

/** Strips the id off an existing entry so it can seed an edit form's draft state. */
export function entryToDraft(entry: Entry): EntryDraft {
  const draft: Partial<Entry> = { ...entry };
  delete draft.id;
  return draft as EntryDraft;
}

/** Short category badge text, e.g. "Sale · wholesale" or "Expense · ingredients". */
export function categoryBadgeLabel(draft: EntryDraft): string {
  const base = ENTRY_TYPE_LABELS[draft.type] ?? draft.type;
  if (draft.type === "SALE" && draft.priceType) return `${base} · ${PRICE_TYPE_LABELS[draft.priceType]}`;
  if (draft.type === "EXPENSE" && draft.category) {
    return `${base} · ${EXPENSE_CATEGORY_LABELS[draft.category] ?? draft.category}`;
  }
  return base;
}

export function isMoneyIn(draft: EntryDraft): boolean {
  return draft.type === "SALE";
}

export function hasAmount(draft: EntryDraft): boolean {
  return draft.type === "SALE" || draft.type === "EXPENSE";
}

/** A plain-language one-sentence description, used to ask "is this right?". */
export function describeDraft(draft: EntryDraft): string {
  const parts: string[] = [];

  if (draft.quantity && draft.unit) parts.push(`${draft.quantity} ${draft.unit}`);
  else if (draft.quantity) parts.push(`${draft.quantity}`);

  if (draft.sku) parts.push(draft.sku);
  if (draft.amount != null) parts.push(formatPeso(draft.amount));
  if (draft.counterparty) parts.push(`for ${draft.counterparty}`);

  const detail = parts.length ? parts.join(", ") : "no details";
  return `${ENTRY_TYPE_LABELS[draft.type] ?? draft.type}: ${detail}`;
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

export function findProduct(products: Product[], sku: string | null): Product | undefined {
  if (!sku) return undefined;
  const n = normalize(sku);
  return (
    products.find((p) => normalize(p.name) === n) ??
    products.find((p) => normalize(p.name).includes(n) || n.includes(normalize(p.name)))
  );
}

/** Strips whitespace so "250 ml" and "250ml" compare equal. */
function normalizeSize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, "");
}

/** Resolves the AI's (or a manual editor's) free-text size mention against one product's
 * variants — first by label text, then loosely by the numeric size alone (so "250" alone
 * still matches a "250ml" variant). Returns undefined rather than guessing when nothing
 * matches, same principle as findProduct above — an unresolved size just leaves the entry's
 * variantId null instead of silently misattributing stock to the wrong size. */
export function findVariant(product: Product | undefined, variantText: string | null): ProductVariant | undefined {
  if (!product || !variantText || product.variants.length === 0) return undefined;
  const n = normalizeSize(variantText);
  return (
    product.variants.find((v) => normalizeSize(v.label) === n) ??
    product.variants.find((v) => v.sizeMl !== null && (n === `${v.sizeMl}ml` || n === String(v.sizeMl)))
  );
}

function findRawMaterial(materials: RawMaterialStock[], name: string | null): RawMaterialStock | undefined {
  if (!name) return undefined;
  const n = normalize(name);
  return (
    materials.find((m) => normalize(m.name) === n) ??
    materials.find((m) => normalize(m.name).includes(n) || n.includes(normalize(m.name)))
  );
}

/** One-line "what happened" detail for a receipt card, including any stock side effects. */
export function entryDetailLine(draft: EntryDraft, products: Product[], rawMaterials: RawMaterialStock[]): string {
  const qtyUnit = draft.quantity ? `${draft.quantity} ${draft.unit ?? "pcs"}` : null;

  if (draft.type === "SALE") {
    const product = findProduct(products, draft.sku);
    const parts = [qtyUnit, draft.counterparty ? `to ${draft.counterparty}` : null].filter(Boolean);
    if (product) parts.push(`stock now ${product.stockQty} left`);
    return parts.join(" · ") || "Logged.";
  }

  if (draft.type === "EXPENSE") {
    const material = findRawMaterial(rawMaterials, draft.sku);
    const parts = [
      qtyUnit && draft.sku ? `${qtyUnit} ${draft.sku}` : draft.sku,
      draft.counterparty ? `from ${draft.counterparty}` : null,
    ].filter(Boolean);
    if (material) parts.push(`now have ${material.qty} ${material.unit}`);
    return parts.join(" · ") || "Logged.";
  }

  if (draft.type === "INVENTORY_IN") {
    const product = findProduct(products, draft.sku);
    const parts = [qtyUnit ? `${qtyUnit} added` : "Added to stock"];
    if (product) parts.push(`stock now ${product.stockQty}`);
    return parts.join(" · ");
  }

  if (draft.type === "INVENTORY_OUT" || draft.type === "WASTE") {
    const product = findProduct(products, draft.sku);
    const parts = [qtyUnit ?? "Some stock", draft.type === "WASTE" ? "spoiled" : "removed"];
    if (product) parts.push(`stock now ${product.stockQty} left`);
    return parts.join(" · ");
  }

  return draft.notes ?? draft.rawText;
}
