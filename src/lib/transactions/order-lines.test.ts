import { test } from "node:test";
import assert from "node:assert/strict";
import { describeOrder, expandOrderLines, orderQuantity, orderTotal, quantitySold } from "./order-lines.ts";
import type { Entry } from "@/lib/store/types";

const order = {
  id: "o1", timestamp: "2026-10-01T00:00:00Z", type: "SALE", amount: 2600, quantity: 8, unit: null, sku: "", counterparty: "Aling Nena",
  location: null, priceType: "standard", category: null, rawText: "", confidence: 1,
  lineItems: [
    { productId: "a", name: "Cacao Tablea · 150g", quantity: 5, unitPrice: 325 },
    { productId: "b", name: "Tablea Ice Cream · 90g", quantity: 3, unitPrice: 325 },
  ],
} as Entry;

test("an order's total and quantity come from its lines", () => {
  assert.equal(orderTotal(order.lineItems!), 2600);
  assert.equal(orderQuantity(order.lineItems!), 8);
  assert.equal(quantitySold(order), 8);
  assert.equal(describeOrder(order.lineItems!), "Cacao Tablea · 150g ×5, Tablea Ice Cream · 90g ×3");
});

test("quantity sold is only for sales", () => {
  assert.equal(quantitySold({ type: "EXPENSE", quantity: 4, lineItems: null }), null);
  assert.equal(quantitySold({ type: "SALE", quantity: 4, lineItems: null }), 4);
});

test("expanding gives one entry per product, whose amounts add back to the order", () => {
  const lines = expandOrderLines([order, { ...order, id: "s", lineItems: null, sku: "Brandy", quantity: 1, amount: 900 }]);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.slice(0, 2).map((l) => [l.sku, l.quantity, l.amount]), [
    ["Cacao Tablea · 150g", 5, 1625],
    ["Tablea Ice Cream · 90g", 3, 975],
  ]);
  assert.equal(lines[2].sku, "Brandy");
});

test("a discounted order shares the discount across its products", () => {
  const [a, b] = expandOrderLines([{ ...order, amount: 2080 }]);
  assert.equal((a.amount ?? 0) + (b.amount ?? 0), 2080);
});
