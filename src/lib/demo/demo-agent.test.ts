import { test } from "node:test";
import assert from "node:assert/strict";
import { demoAgentReply } from "./demo-agent.ts";
import { buildDemoData } from "./demo-data.ts";
import { assembleProduct } from "@/lib/store/sheet-shapes";
import type { AgentView } from "@/lib/ai/agent-tools";
import type { CostContext } from "@/lib/summary/recipe-cost";

const now = new Date(2026, 10, 20, 12);
const data = buildDemoData(now);
const products = data.products.map((row) => assembleProduct(row, data.recipes));
const ctx = { rawMaterials: data.rawMaterials, supplierPrices: data.supplierPrices, hourlyLaborRate: 90, cacaoUtilization: 0.8, entries: data.entries, products } as unknown as CostContext;
const view: AgentView = { role: "executive", data, products, ctx, now };
const ask = (text: string) => demoAgentReply(view, text);

test("a sale with product, size, buyer and method becomes a card to confirm", () => {
  const r = ask("sold 3 tablea 150g to Liza gcash");
  assert.equal(r.proposal?.kind, "transaction", r.reply);
  const d = r.proposal!.kind === "transaction" ? r.proposal!.draft : null;
  assert.equal(d?.counterparty, "Liza");
  assert.equal(d?.lineItems?.[0].name, "MKC Tablea · 150 g");
  assert.equal(d?.lineItems?.[0].quantity, 3);
  assert.equal(d?.amount, 1050);
  assert.equal(d?.paymentMethod, "ewallet");
});

test("several products in one order", () => {
  const r = ask("Sold 2 brandy and 5 vanilla ice cream to Mark");
  assert.equal(r.proposal?.kind, "transaction", r.reply);
  const d = r.proposal!.kind === "transaction" ? r.proposal!.draft : null;
  assert.equal(d?.lineItems?.length, 2);
});

test("a sale with no buyer asks for it and offers the form", () => {
  const r = ask("sold 2 brandy");
  assert.equal(r.proposal?.kind, "incomplete");
  assert.match(r.reply, /Who bought it/);
});

test("an expense with amount and payee", () => {
  const r = ask("paid 450 for delivery to Kuya Jun");
  assert.equal(r.proposal?.kind, "transaction", r.reply);
  const d = r.proposal!.kind === "transaction" ? r.proposal!.draft : null;
  assert.equal(d?.type, "EXPENSE");
  assert.equal(d?.amount, 450);
  assert.equal(d?.category, "transport");
  assert.equal(d?.counterparty, "Kuya Jun");
});

test("spoilage", () => {
  const r = ask("5 ice cream cups melted");
  assert.ok(r.proposal, r.reply);
  const d = r.proposal!.kind !== "payment" ? r.proposal!.draft : null;
  assert.equal(d?.type, "WASTE");
  assert.equal(d?.quantity, 5);
});

test("questions are answered from the demo records", () => {
  assert.match(ask("How much did we sell this month?").reply, /sales ₱/);
  assert.match(ask("Who still owes us?").reply, /owed/i);
  assert.match(ask("What sells best?").reply, /Best sellers/);
  assert.equal(ask("hello there").proposal, null);
});
