import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoData } from "./demo-data.ts";
import { entryIntegrityProblem } from "@/lib/transactions/ledger";
import { expandOrderLines } from "@/lib/transactions/order-lines";
import { resolveProductId } from "@/lib/summary/product-match";
import { assembleProduct } from "@/lib/store/sheet-shapes";

const now = new Date(2026, 10, 19, 12);
const data = buildDemoData(now);
const products = data.products.map((row) => assembleProduct(row, data.recipes));

test("every demo record passes the server's own checks", () => {
  for (const e of data.entries) assert.equal(entryIntegrityProblem(e), null, `${e.id} ${e.sku}`);
});

test("every sale line lands on the product it was written for", () => {
  for (const sale of data.entries.filter((e) => e.type === "SALE")) {
    const lines = sale.lineItems ?? [];
    for (const line of lines) assert.equal(resolveProductId(products, line.name), line.productId, line.name);
  }
  for (const line of expandOrderLines(data.entries.filter((e) => e.type === "SALE"))) assert.ok(resolveProductId(products, line.sku), String(line.sku));
});

test("about seven months of trading, nothing after today, and the same shop every time", () => {
  const months = new Set(data.entries.map((e) => e.timestamp.slice(0, 7)));
  assert.ok(months.size >= 7, `${months.size} months`);
  assert.ok(data.entries.every((e) => new Date(e.timestamp) <= new Date(2026, 10, 20)));
  assert.equal(JSON.stringify(buildDemoData(now).entries), JSON.stringify(data.entries));
});

test("the Executive and the Employee profile both exist", () => {
  const roles = (data.users as { role: string }[]).map((u) => u.role).sort();
  assert.deepEqual(roles, ["employee", "executive"]);
});
