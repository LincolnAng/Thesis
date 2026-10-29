import { test } from "node:test";
import assert from "node:assert/strict";
import { draftFor, parseCsv, planImport } from "./transactions-import.ts";
import type { Entry, Product } from "@/lib/store/types";

const products = [
  { id: "t150", name: "MKC Tablea", sizeLabel: "150g", sizeOfId: null },
  { id: "brandy", name: "MKC Brandy", sizeLabel: null, sizeOfId: null },
] as unknown as Product[];

const csv = `date,type,item,quantity,unit,unit_price,amount,party,payment,bank,category,note
2026-09-02,sale,mkc brandy,8,,500,4000,vjandep,checke,,,
2026-09-02,sale,mkc 150g,12,,285,3420,vjandep,checke,,,
2026-09-03,sale,"3.5OZ TABLEYA IC, vanilla",1,,95,95,KHENT,CASH,,,
2026-09-15,expense,Sweldo Khent,,,,"6,020.31",Khent,,,labor,
2026-08-05,sale,mkc 150g,19,,285,5360.85,VJANDEP,CHECKE,,,Less 1% withholding tax`;

test("a customer's lines on one day become one order; products match by name; odd totals are flagged", () => {
  const rows = parseCsv(csv);
  assert.equal(rows.length, 5);
  assert.equal(rows[2].item, "3.5OZ TABLEYA IC, vanilla");
  const plan = planImport(rows, products, []);
  assert.equal(plan.length, 4);
  const order = plan[0];
  assert.equal(order.lines.length, 2);
  assert.equal(order.amount, 7420);
  assert.deepEqual(order.lines.map((l) => l.productId), ["brandy", "t150"]);
  assert.equal(order.method, "check");
  assert.equal(plan[1].lines[0].productId, null); // not a product: kept by name
  assert.equal(plan[2].amount, 6020.31);
  assert.equal(plan[2].category, "labor");
  assert.ok(plan[3].warnings.some((w) => w.includes("5415")));

  const draft = draftFor(order, products);
  assert.equal(draft.rawText, "Imported past record (stock not moved)");
  assert.equal(draft.lineItems?.length, 2);
  assert.equal(draft.amount, 7420);
});

test("rows already in Transactions are marked to skip", () => {
  const existing = [{ id: "x", type: "EXPENSE", timestamp: new Date(2026, 8, 15, 12).toISOString(), amount: 6020.31, counterparty: "Khent" }] as unknown as Entry[];
  const plan = planImport(parseCsv(csv), products, existing);
  assert.equal(plan[2].duplicate, true);
  assert.equal(plan[0].duplicate, false);
});
