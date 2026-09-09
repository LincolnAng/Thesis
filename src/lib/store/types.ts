export type EntryType =
  | "SALE"
  | "EXPENSE"
  | "INVENTORY_IN"
  | "INVENTORY_OUT"
  | "WASTE"
  | "SUPPLIER"
  | "NOTE";

export type PriceType = "standard" | "friend" | "wholesale" | null;

// The 6 built-ins below always exist; a plain string (not a closed union) so the
// owner can add their own categories from the Expenses budget editor — anything
// not in EXPENSE_CATEGORY_LABELS just displays as its own raw name.
export type ExpenseCategory = string;

export const BUILT_IN_EXPENSE_CATEGORIES = [
  "raw_materials",
  "labor",
  "utilities",
  "packaging",
  "transport",
  "misc",
] as const;

export interface Entry {
  id: string;
  timestamp: string; // ISO date
  type: EntryType;
  amount: number | null; // pesos
  quantity: number | null;
  unit: string | null; // jars, kg, pcs, etc.
  sku: string | null; // product name
  counterparty: string | null; // buyer / supplier name
  location: string | null;
  priceType: PriceType;
  category: ExpenseCategory | null;
  rawText: string;
  confidence: number; // 0-1
  notes?: string | null;
  /** Links this entry to a Customer record when `counterparty` matches one by name
   * (resolved automatically in store.ts, or set explicitly). Historical entries logged
   * before Customers existed stay matched by `counterparty` name alone — this is an
   * additive linkage, not a replacement for it. */
  customerId?: string | null;
  /** Links this entry to one of the matched product's ProductVariant rows (e.g. which size
   * was sold), when the product has variants and one could be resolved. Null for products
   * with no variants, or when the size genuinely wasn't stated/resolvable. */
  variantId?: string | null;
  /** Tags this entry as counting against one Allocation's reserved quantity (e.g. this sale
   * came out of the "Nomad" allocation, not the general pool). Manually selected only — the
   * AI parser doesn't infer this in v1. Null means "counts against the general pool", same
   * as every entry before Allocations existed. */
  allocationId?: string | null;
  /** Tags this entry as part of one time-boxed sales Event (e.g. a mall fiesta week), for
   * filtering — independent of allocationId, though the two are often used together. */
  eventId?: string | null;
}

export interface RecipeIngredientRow {
  id: string;
  materialId: string; // references RawMaterialStock.id — cost lives there, not here
  quantity: number; // amount of that material used per batch, in the material's own unit
}

export interface RecipeExtraRow {
  id: string;
  label: string;
  cost: number; // cost per batch, in pesos
}

export type PricingMode = "manual" | "cost_percent" | "competitive" | "suggested";

/** An optional per-size/variant breakdown for a product (e.g. 250ml vs 500ml jars of the
 * same spread). Most products have none — `stockQty` on the Product itself stays the real,
 * directly-mutated total either way (see applyEntrySideEffects in store.ts); a variant's own
 * stockQty is an additional, opt-in breakdown of that same total by size, not a replacement
 * for it, so nothing about existing single-size products' stock tracking changes. */
export interface ProductVariant {
  id: string;
  productId: string;
  label: string; // free text, e.g. "250ml" — matched against both manual selection and the AI's free-text size mention
  sizeMl: number | null; // best-effort numeric size parsed from label, for looser AI-text matching (e.g. "250" alone)
  stockQty: number;
  priceOverride: number | null; // reserved for a future per-size price (null = uses the product's normal price)
}

export interface Product {
  id: string;
  name: string;
  standardPrice: number;
  pricingMode: PricingMode; // how standardPrice is determined; "cost_percent"/"competitive" compute it live instead
  marginPercent: number; // used only when pricingMode === "cost_percent"
  marketPrice: number; // used only when pricingMode === "competitive" — what similar products sell for
  friendPrice: number;
  wholesalePrice: number;
  stockQty: number;
  lowStockThreshold: number;
  batchYield: number; // jars produced per batch
  recipeIngredients: RecipeIngredientRow[];
  recipeLabor: RecipeExtraRow[];
  recipeMisc: RecipeExtraRow[];
  variants: ProductVariant[];
}

export type SupplierType = "packaging" | "raw_materials";

export interface PriceHistoryPoint {
  date: string;
  price: number;
}

export interface Supplier {
  id: string;
  name: string;
  type: SupplierType;
  items: string; // free text: what they supply
  lastPrice: number;
  priceHistory: PriceHistoryPoint[];
  contact: string;
}

export interface RawMaterialStock {
  id: string;
  name: string; // cocoa beans, jars, labels, oil, sugar
  unit: string; // kg, pcs, L
  qty: number;
  lowStockThreshold: number;
  perBatchQty: number | null; // how much one production batch uses, for "enough for N batches"
  color: string | null; // user-chosen hex override for the stock calendar line; null = auto (urgency-based)
  unitCost: number; // current cost per unit — the single source of truth for recipe costing
}

export interface SocialStatEntry {
  id: string;
  platform: "Facebook" | "TikTok" | "Instagram";
  weekOf: string; // ISO date, start of week
  followers: number;
  reach: number;
  engagements: number;
}

export interface TokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedBudgetTokens: number; // ceiling before "low credits" warning
}

export interface AiStatus {
  apiKeyMissing: boolean;
}

export interface Customer {
  id: string;
  name: string;
  contact: string;
  notes: string;
}

export type PriceTierDimension = "region" | "quantity_break" | "customer";

/** One overlay price rule for a product (optionally scoped to one of its variants) — covers
 * both "tiered/regional pricing" and "wholesale/bulk pricing" with a single mechanism, since
 * they're the same shape: a price that depends on one dimension. dimensionValue holds a
 * region name (dimensionType "region"), a minimum quantity as a numeric string
 * (dimensionType "quantity_break" — meets or exceeds this qty), or a Customer id
 * (dimensionType "customer"). price is per unit, same convention as
 * Product.standardPrice/friendPrice/wholesalePrice. Products with no PriceTier rows behave
 * exactly as before — this is an optional overlay, not a replacement for those flat fields. */
export interface PriceTier {
  id: string;
  productId: string;
  variantId: string | null; // null = applies at the whole-product level regardless of size
  dimensionType: PriceTierDimension;
  dimensionValue: string;
  price: number;
  label: string; // display label, e.g. "Manila", "10+ jars", or a customer's name
}

/**
 * A soft reservation of some of a product's stock for one distributor/event (e.g. "30 jars
 * for Nomad", "20 jars for the IFEX trade show") — bookkeeping only. allocatedQty is never
 * subtracted from Product.stockQty; the physical stock pool and its mutation (in
 * applyEntrySideEffects) are completely unaffected by allocations existing. "Used" and
 * "remaining" are computed by summing entries tagged with this allocation's id (see
 * lib/summary/allocations.ts) — the allocation itself never stores a running total, so
 * there's nothing here that can drift out of sync with the entries that reference it.
 */
export interface Allocation {
  id: string;
  productId: string;
  variantId: string | null;
  label: string; // e.g. "Nomad", "IFEX trade show"
  allocatedQty: number;
  eventId: string | null;
  createdAt: string;
}

/** A time-boxed sales period (a one-week mall fiesta, a holiday promo, a trade show) — a
 * thin, standalone entity, not a subsystem. Its only real behavior is being something
 * entries and allocations can optionally tag (Entry.eventId, Allocation.eventId), so
 * activity during it can be viewed separately from ordinary day-to-day tracking — see
 * lib/summary/event-summary.ts. */
export interface Event {
  id: string;
  name: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
  notes: string;
}

export interface SyncStatus {
  /** True if the most recently settled write to Google Sheets failed. Clears
   * on the next write that succeeds — it does not mean the failed write was
   * retried, only that something didn't save and hasn't been confirmed since. */
  failing: boolean;
  failedAt: string | null;
}
