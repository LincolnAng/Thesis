import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool, toolsFor, type AgentView } from "./agent-tools.ts";
import type { Entry, Product } from "@/lib/store/types";
import type { BusinessData } from "@/lib/auth/permissions";

const product = (id: string, name: string, size: string | null, price: number): Product =>
  ({ id, name, sizeLabel: size, standardPrice: price, pricingMode: "manual", marginPercent: 0, marketPrice: 0, friendPrice: 0, wholesalePrice: 0, stockQty: 10, lowStockThreshold: 0, batchYield: 10, unit: "pack", recipeIngredients: [], recipeLabor: [], recipeMisc: [] }) as Product;

const products = [product("t150", "Cacao Tablea", "150g (12 pcs)", 325), product("ice", "Tablea Ice Cream", "90g", 120)];

const entry = (over: Partial<Entry>): Entry =>
  ({ id: "e", timestamp: "2026-10-05T10:00:00", type: "SALE", amount: 650, quantity: 2, unit: null, sku: "Cacao Tablea · 150g (12 pcs)", counterparty: "Aling Nena", location: null, priceType: "standard", category: null, rawText: "", confidence: 1, ...over }) as Entry;

function view(role: "executive" | "employee", entries: Entry[] = []): AgentView {
  const data = { entries, products: [], recipes: [], rawMaterials: [], suppliers: [], supplierPriceHistory: [], budgets: [], events: [], eventStock: [], machines: [], supplierPrices: [], businessSettings: [], users: [], activity: [] } as unknown as BusinessData;
  return { role, data, products, ctx: { rawMaterials: [], supplierPrices: [], hourlyLaborRate: 0, cacaoUtilization: 1, entries, products }, now: new Date(2026, 9, 15, 9, 0) };
}

test("employees aren't offered the executive-only tools, and are refused if they try", () => {
  const names = toolsFor("employee").map((t) => t.name);
  for (const n of ["money_owed", "spending", "investments", "product_costing", "prepare_payment"]) assert.ok(!names.includes(n), n);
  const out = runTool("money_owed", { direction: "owed_to_us" }, view("employee"));
  assert.ok(out.isError);
  assert.match(out.result, /Executive/);
});

test("a multi-product sale is prepared as one order at catalogue prices, for confirmation only", () => {
  const out = runTool("prepare_transaction", { type: "sale", items: [{ product: "Cacao Tablea · 150g (12 pcs)", quantity: 5 }, { product: "Tablea Ice Cream · 90g", quantity: 3 }] }, view("executive"));
  assert.equal(out.proposal?.kind, "transaction");
  const draft = out.proposal?.kind === "transaction" ? out.proposal.draft : null;
  assert.equal(draft?.lineItems?.length, 2);
  assert.equal(draft?.quantity, 8);
  assert.equal(draft?.amount, 5 * 325 + 3 * 120);
  assert.match(out.result, /shown_for_confirmation/);
});

test("an unknown product makes it ask instead of guessing", () => {
  const out = runTool("prepare_transaction", { type: "sale", items: [{ product: "Chocolate cake", quantity: 1 }] }, view("executive"));
  assert.ok(out.isError);
  assert.equal(out.proposal, undefined);
});

test("an employee can't prepare an expense or capital", () => {
  for (const type of ["expense", "capital", "asset"]) {
    const out = runTool("prepare_transaction", { type, amount: 100, description: "x", counterparty: "y" }, view("employee"));
    assert.ok(out.isError, type);
  }
});

test("an unpaid sale becomes a receivable; bank transfer needs a bank", () => {
  const ok = runTool("prepare_transaction", { type: "sale", items: [{ product: "Tablea Ice Cream · 90g", quantity: 2 }], paid_now: false, due_date: "2026-10-30" }, view("executive"));
  assert.equal(ok.proposal?.kind === "transaction" && ok.proposal.draft.paymentTerm, "receivable");
  const noBank = runTool("prepare_transaction", { type: "expense", description: "Jars", amount: 500, method: "bank_transfer" }, view("executive"));
  assert.ok(noBank.isError);
});

test("money owed lists receivables still unpaid, and a payment can be prepared against one", () => {
  const v = view("executive", [entry({ id: "r1", paymentTerm: "receivable", dueDate: "2026-10-10" }), entry({ id: "s1" })]);
  const owed = JSON.parse(runTool("money_owed", { direction: "owed_to_us" }, v).result);
  assert.equal(owed.count, 1);
  assert.equal(owed.rows[0].overdue_days, 5);
  const pay = runTool("prepare_payment", { transaction_id: "r1", amount: 650, method: "bank_transfer", bank: "BDO" }, v);
  assert.equal(pay.proposal?.kind, "payment");
  assert.equal(pay.proposal?.kind === "payment" && pay.proposal.patch.paymentStatus, "settled");
});

test("an employee's overview is sales only", () => {
  const out = JSON.parse(runTool("business_overview", { period: "this_month" }, view("employee", [entry({})])).result);
  assert.equal(out.sales, 650);
  assert.equal(out.money_earned, undefined);
});
