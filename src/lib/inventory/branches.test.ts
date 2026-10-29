import { test } from "node:test";
import assert from "node:assert/strict";
import { branchesOf, stockByBranch } from "./branches.ts";
import type { Entry, Product } from "@/lib/store/types";

const p = { id: "t", name: "Tablea", stockQty: 100 } as Product;
const e = (over: Partial<Entry>): Entry => ({ id: Math.random().toString(), timestamp: "2026-10-01T00:00:00Z", type: "SALE", amount: 1, quantity: 1, unit: null, sku: "Tablea", counterparty: null, location: null, priceType: null, category: null, rawText: "", confidence: 1, ...over }) as Entry;
const branches = branchesOf({});

test("the main branch holds whatever isn't at another branch", () => {
  assert.deepEqual(stockByBranch(p, [p], [], [], branches), { cdo: 100, manila: 0 });
  const moved = [{ id: "x", productId: "t", fromBranch: "cdo", toBranch: "manila", quantity: 30, date: "2026-10-02", note: "", createdAt: "" }];
  // 30 shipped to Manila, then Manila sold 5 (the total, 100 → 95, already reflects the sale).
  const sold = [e({ branch: "manila", quantity: 5 })];
  assert.deepEqual(stockByBranch({ ...p, stockQty: 95 }, [p], sold, moved, branches), { cdo: 70, manila: 25 });
  // Old sales with no branch are the main branch's.
  assert.deepEqual(stockByBranch({ ...p, stockQty: 90 }, [p], [e({ quantity: 10 })], [], branches), { cdo: 90, manila: 0 });
  // A multi-product order at Manila takes only this product's line.
  const order = e({ branch: "manila", sku: "2 products", quantity: 7, lineItems: [{ productId: "t", name: "Tablea", quantity: 4, unitPrice: 1 }, { productId: "z", name: "Biko", quantity: 3, unitPrice: 1 }] });
  assert.deepEqual(stockByBranch({ ...p, stockQty: 96 }, [p], [order], moved, branches), { cdo: 70, manila: 26 });
});

test("branches come from settings, with CDO and Manila to start", () => {
  assert.deepEqual(branchesOf({}).map((b) => b.name), ["CDO", "Manila"]);
  assert.deepEqual(branchesOf({ branches: JSON.stringify([{ id: "cdo", name: "CDO" }, { id: "sg", name: "Singapore", country: "Singapore" }]) }).map((b) => `${b.name}/${b.country}`), ["CDO/Philippines", "Singapore/Singapore"]);
});

test("Manila price suggestions from freight: same peso profit, or same margin", async () => {
  const { recommendedBranchPrices, suggestedPriceAtBranch } = await import("./branch-prices.ts");
  assert.deepEqual(recommendedBranchPrices(325, 200, 25), { sameProfit: 350, sameMargin: 366 });
  assert.deepEqual(recommendedBranchPrices(325, null, 25), { sameProfit: 350, sameMargin: null });
  const settings = { "branchFreight:p1:manila": "25" };
  assert.equal(suggestedPriceAtBranch(settings, branchesOf({}), "p1", "manila", 325), 350);
  assert.equal(suggestedPriceAtBranch({ ...settings, "branchPrice:p1:manila": "360" }, branchesOf({}), "p1", "manila", 325), 360);
  assert.equal(suggestedPriceAtBranch(settings, branchesOf({}), "p1", "cdo", 325), 325);
});
