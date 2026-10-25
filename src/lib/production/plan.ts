import { unitsPerBatch } from "@/lib/costing/per-unit";
import type { Product } from "@/lib/store/types";

/**
 * Production planning across the whole process — cacao beans into tablea, tablea into packs,
 * ice cream and brandy — worked backwards from what needs to be sold.
 *
 * Every product's need is its own demand plus what the products made from it will use. Each
 * stage is planned in units (a jar, a kg), and everything is held to three rules:
 *
 *   1. NON-NEGATIVITY — nothing is planned below zero: no negative production, no negative
 *      stock, no negative purchases.
 *   2. BALANCE — what a stage produces covers what it is asked for (inputs ≥ outputs), and
 *      each unit draws exactly its recipe's inputs.
 *   3. AVAILABILITY — "can make now" never uses more beans, sugar, jars or tablea than are on
 *      hand. What is missing becomes a restock alert with the amount to buy.
 *
 * The sources of truth are Costing (recipes, components) and Transactions (stock,
 * worked out from what was bought, made, sold and spoiled). Pure: no store, no React.
 */

export interface PlanMaterial {
  id: string;
  name: string;
  unit: string;
  /** On the shelf now, per the ledger. */
  onHand: number;
  /** Restock when on-hand falls to this. 0 when not set. */
  reorderPoint: number;
}

export interface PlanInput {
  products: Product[];
  materials: PlanMaterial[];
  /** Units of each product expected to be needed (forecast plus events), by product id. */
  demand: Map<string, number>;
  /** Units of each product on hand and still good, by product id. Defaults to stockQty. */
  onHand?: Map<string, number>;
  /** Raw amount drawn for a recipe quantity (recipes are in usable cacao). */
  rawPerBatch?: (material: PlanMaterial, recipeQty: number) => number;
}

export interface ProductPlan {
  productId: string;
  name: string;
  unit: string;
  /** Expected to sell. */
  demand: number;
  /** Needed by products made from this one. */
  usedByOthers: number;
  /** demand + usedByOthers. */
  need: number;
  onHand: number;
  /** need − onHand, never below zero: how many to make. */
  shortfall: number;
  /** Of `shortfall`, how many the stock on hand right now allows. */
  canMakeNow: number;
  /** What stops the rest, when canMakeNow < shortfall. */
  limitedBy: string | null;
}

export interface MaterialPlan {
  materialId: string;
  name: string;
  unit: string;
  /** Drawn by everything planned. */
  required: number;
  onHand: number;
  /** required − onHand, never below zero: the amount to buy. */
  toBuy: number;
  reorderPoint: number;
  belowReorderPoint: boolean;
}

export interface PlanResult {
  products: ProductPlan[];
  materials: MaterialPlan[];
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Products in an order where everything made FROM a product comes before it, so a component's
 * need is complete by the time it is planned. A recipe that (by mistake) uses itself, directly
 * or round a loop, has that link ignored rather than looping forever.
 */
export function downstreamFirst(products: Product[]): Product[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const usedIn = new Map<string, string[]>(); // component id → ids of products that use it
  for (const p of products) {
    for (const c of p.recipeComponents ?? []) {
      if (!byId.has(c.productId) || c.productId === p.id) continue;
      usedIn.set(c.productId, [...(usedIn.get(c.productId) ?? []), p.id]);
    }
  }
  const order: Product[] = [];
  const state = new Map<string, "visiting" | "done">();
  // A product is placed after every product that uses it.
  const visit = (id: string) => {
    if (state.get(id) === "done" || state.get(id) === "visiting") return;
    state.set(id, "visiting");
    for (const parent of usedIn.get(id) ?? []) visit(parent);
    state.set(id, "done");
    order.push(byId.get(id) as Product);
  };
  for (const p of products) visit(p.id);
  return order;
}

export function planProduction(input: PlanInput): PlanResult {
  const { products, materials, demand } = input;
  const onHandOf = (p: Product) => Math.max(0, input.onHand?.get(p.id) ?? p.stockQty);
  const rawPerBatch = input.rawPerBatch ?? ((_m: PlanMaterial, qty: number) => qty);
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const productById = new Map(products.map((p) => [p.id, p]));
  // Recipes are stored a batch at a time; everything here is per unit.
  const each = (p: Product, batchQty: number) => Math.max(0, batchQty) / unitsPerBatch(p);

  // ── Requirements, top down ────────────────────────────────────────────────
  const usedByOthers = new Map<string, number>();
  const plans = new Map<string, ProductPlan>();
  const required = new Map<string, number>();

  for (const p of downstreamFirst(products)) {
    const own = Math.max(0, demand.get(p.id) ?? 0);
    const fromOthers = usedByOthers.get(p.id) ?? 0;
    const need = own + fromOthers;
    const onHand = onHandOf(p);
    const shortfall = Math.max(0, need - onHand);

    plans.set(p.id, {
      productId: p.id,
      name: p.name,
      unit: p.unit?.trim() || "pcs",
      demand: round(own),
      usedByOthers: round(fromOthers),
      need: round(need),
      onHand: round(onHand),
      shortfall: round(shortfall),
      canMakeNow: 0,
      limitedBy: null,
    });

    for (const c of p.recipeComponents ?? []) {
      if (c.productId === p.id || !productById.has(c.productId)) continue;
      usedByOthers.set(c.productId, (usedByOthers.get(c.productId) ?? 0) + shortfall * each(p, c.quantity));
    }
    for (const row of p.recipeIngredients) {
      const m = materialById.get(row.materialId);
      if (!m) continue;
      required.set(m.id, (required.get(m.id) ?? 0) + shortfall * each(p, rawPerBatch(m, row.quantity)));
    }
  }

  // ── What can be made now, bottom up ───────────────────────────────────────
  // Upstream stages first (tablea before ice cream), so what is made now can feed the next
  // stage. Shared materials are handed out in that order and never below zero.
  const remainingMaterial = new Map(materials.map((m) => [m.id, Math.max(0, m.onHand)]));
  const remainingProduct = new Map(products.map((p) => [p.id, onHandOf(p)]));
  for (const p of [...downstreamFirst(products)].reverse()) {
    const plan = plans.get(p.id) as ProductPlan;
    if (plan.shortfall === 0) continue;
    let possible = plan.shortfall;
    let limitedBy: string | null = null;
    const limit = (available: number, perUnit: number, name: string) => {
      if (perUnit <= 0) return;
      const n = round(available / perUnit);
      if (n < possible) {
        possible = Math.max(0, n);
        limitedBy = name;
      }
    };
    for (const row of p.recipeIngredients) {
      const m = materialById.get(row.materialId);
      if (m) limit(remainingMaterial.get(m.id) ?? 0, each(p, rawPerBatch(m, row.quantity)), m.name);
    }
    for (const c of p.recipeComponents ?? []) {
      const comp = productById.get(c.productId);
      if (comp && comp.id !== p.id) limit(remainingProduct.get(comp.id) ?? 0, each(p, c.quantity), comp.name);
    }
    for (const row of p.recipeIngredients) {
      const m = materialById.get(row.materialId);
      if (m) remainingMaterial.set(m.id, Math.max(0, (remainingMaterial.get(m.id) ?? 0) - possible * each(p, rawPerBatch(m, row.quantity))));
    }
    for (const c of p.recipeComponents ?? []) {
      if (productById.has(c.productId) && c.productId !== p.id) {
        remainingProduct.set(c.productId, Math.max(0, (remainingProduct.get(c.productId) ?? 0) - possible * each(p, c.quantity)));
      }
    }
    // What this stage makes now is available to the stages made from it.
    remainingProduct.set(p.id, (remainingProduct.get(p.id) ?? 0) + possible);
    plan.canMakeNow = round(possible);
    plan.limitedBy = possible < plan.shortfall ? limitedBy : null;
  }

  // ── Materials ─────────────────────────────────────────────────────────────
  const materialPlans: MaterialPlan[] = materials.map((m) => {
    const req = round(required.get(m.id) ?? 0);
    const onHand = round(Math.max(0, m.onHand));
    return {
      materialId: m.id,
      name: m.name,
      unit: m.unit,
      required: req,
      onHand,
      toBuy: round(Math.max(0, req - onHand)),
      reorderPoint: m.reorderPoint,
      belowReorderPoint: m.reorderPoint > 0 && onHand <= m.reorderPoint,
    };
  });

  return { products: products.map((p) => plans.get(p.id) as ProductPlan), materials: materialPlans };
}
