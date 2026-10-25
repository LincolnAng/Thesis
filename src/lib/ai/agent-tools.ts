import type Anthropic from "@anthropic-ai/sdk";
import { PAYROLL_CATEGORIES, type BusinessData } from "@/lib/auth/permissions";
import type { Entry, EntryType, OrderLine, PaymentMethod, Product, Role } from "@/lib/store/types";
import type { EntryDraft } from "@/lib/home/describe-entry";
import type { CostContext } from "@/lib/summary/recipe-cost";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { findProduct } from "@/lib/summary/product-match";
import { resolveProduct } from "@/lib/ai/product-resolve";
import { fullName } from "@/lib/summary/product-sizes";
import { costPerUnit } from "@/lib/costing/price-calc";
import { canBeOwed, dueInfo, isAnyInvestment, monthOf, outstanding, paidSoFar, statusOf, summarize, termOf, addPayment } from "@/lib/transactions/ledger";
import { describeOrder, expandOrderLines, orderQuantity, orderTotal, quantitySold } from "@/lib/transactions/order-lines";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/format";

/**
 * The assistant's tools over the shop's own records — read-only, run on the server, over the
 * data the signed-in profile is allowed to see (lib/auth/load-business-data). An employee's
 * data has no costs, expenses, investments or payment terms in it, and the executive-only tools
 * aren't offered to them at all, so nothing here can reach past the person asking.
 *
 * Two tools prepare changes — a new transaction, or a payment on something owed — but never
 * make them: they return a draft that the person confirms on screen, and saving goes through
 * the app's normal path and the server's permission checks.
 *
 * Every figure comes from the records. A tool that has nothing to go on says so.
 */

export interface AgentView {
  role: Role;
  data: BusinessData;
  products: Product[];
  ctx: CostContext;
  now: Date;
}

/** What a prepare_* tool hands back to the screen for confirming. */
export type Proposal =
  | { kind: "transaction"; draft: EntryDraft; stated: string[] }
  /** Something to record with gaps BAi is asking about; shown as a form they can finish by hand. */
  | { kind: "incomplete"; draft: EntryDraft; missing: string[] }
  | { kind: "payment"; entryId: string; summary: string; patch: Partial<Entry> };

export interface ToolOutcome {
  result: string;
  isError?: boolean;
  proposal?: Proposal;
}

// "spending" is open to employees: their records hold everyday expenses only, never salaries.
const EXEC_ONLY = new Set(["money_owed", "investments", "product_costing", "prepare_payment"]);

const period = {
  type: "string",
  description: 'Which period: "this_month", "last_month", "all", or a month as "YYYY-MM".',
} as const;

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "business_overview",
    description:
      "Money for a period from the shop's records: cash received and paid, sales, expenses, spoilage, money earned (sales − expenses − spoilage), what customers still owe and what the shop still owes, capital put in, and spending on long-term assets. Use for any question about how much came in, went out, was sold or earned.",
    input_schema: { type: "object", properties: { period }, required: ["period"] },
  },
  {
    name: "money_owed",
    description:
      "Payables and receivables still owed: who owes the shop (receivables) or whom the shop owes (payables), with amounts, due dates, overdue days and status (not paid yet, partly paid, defaulted).",
    input_schema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["owed_to_us", "we_owe"] },
        only: { type: "string", enum: ["all", "overdue", "defaulted"], description: "Default all." },
      },
      required: ["direction"],
    },
  },
  {
    name: "product_sales",
    description: "Units sold and revenue per product for a period, best seller first. Multi-product orders count each product.",
    input_schema: { type: "object", properties: { period }, required: ["period"] },
  },
  {
    name: "spending",
    description: "Expenses for a period by category, with the largest items. Long-term asset purchases are listed separately, not as expenses.",
    input_schema: { type: "object", properties: { period, category: { type: "string", description: "Optional category, e.g. packaging." } }, required: ["period"] },
  },
  {
    name: "investments",
    description: "Capital put in by owners or investors, and long-term assets bought (machinery, freezers), for a period.",
    input_schema: { type: "object", properties: { period }, required: ["period"] },
  },
  {
    name: "products",
    description: "Every product with its selling price and stock on hand (executives also get cost per unit and margin).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "product_costing",
    description: "One product's recipe and costs: each ingredient's quantity, cost per unit and subtotal, batch cost, units per batch, cost per unit, price and margin.",
    input_schema: { type: "object", properties: { product: { type: "string", description: "Product name, with size if it has one." } }, required: ["product"] },
  },
  {
    name: "find_transactions",
    description: "Search recorded transactions by words (product, customer, supplier, notes), type and period. Returns up to `limit` rows with their ids.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        type: { type: "string", enum: ["sale", "expense", "spoilage", "capital", "asset", "any"] },
        period,
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: "prepare_transaction",
    description:
      "Prepare a new transaction for the person to check and confirm. Nothing is saved until they press Log on the card. Call it whenever someone wants something recorded — even if details are missing: it matches loosely typed product names (typos, no size, words like 'jars' or 'orders'), and reports back everything still missing or unclear so you can ask for it all at once. A sale needs each product with its quantity (several products make one order) and the buyer's name; an expense needs what it was for, the amount and who was paid; an asset needs what was bought and the amount; capital needs who put it in and the amount; spoilage and batch_made need a product and quantity. Pass products as the person wrote them; don't invent quantities, buyers or amounts.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["sale", "expense", "spoilage", "batch_made", "capital", "asset"] },
        date: { type: "string", description: "YYYY-MM-DD; omit for today." },
        items: {
          type: "array",
          description: "Products in a sale (or the one product for spoilage / batch_made).",
          items: {
            type: "object",
            properties: {
              product: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number", description: "Only if the person said the price." },
            },
            required: ["product", "quantity"],
          },
        },
        amount: { type: "number", description: "Total in pesos, for expense / asset / capital, or a sale total the person stated." },
        description: { type: "string", description: "What an expense or asset was for." },
        category: { type: "string", description: "Expense category, e.g. packaging, utilities, transport, labor, raw_materials, misc." },
        counterparty: { type: "string", description: "Customer, supplier, or who put in capital." },
        paid_now: { type: "boolean", description: "False when the customer pays later (receivable) or the shop pays later (payable)." },
        method: { type: "string", enum: ["cash", "bank_transfer", "check"] },
        bank: { type: "string" },
        due_date: { type: "string", description: "YYYY-MM-DD, for something paid later." },
        notes: { type: "string" },
      },
      required: ["type"],
    },
  },
  {
    name: "remember",
    description:
      "Save something worth remembering about this person for future conversations: how they like answers (short, in Bisaya, with bullet points), what they call things or people, a regular customer's or supplier's habits, a standing preference (\"Aling Nena always pays by GCash\"). Use it when they tell you a preference or correct you, or you notice a clear habit. Don't save one-off facts, figures that live in the records, or anything sensitive (PINs, passwords, account numbers). Keep each note to one short sentence.",
    input_schema: { type: "object", properties: { note: { type: "string" } }, required: ["note"] },
  },
  {
    name: "forget",
    description: "Remove saved notes about this person that contain these words — when they say a note is wrong or ask you to forget something.",
    input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "prepare_payment",
    description:
      "Prepare a payment against a receivable or payable (found with money_owed or find_transactions) for the person to confirm. Nothing is saved until they confirm.",
    input_schema: {
      type: "object",
      properties: {
        transaction_id: { type: "string" },
        amount: { type: "number" },
        date: { type: "string", description: "YYYY-MM-DD; omit for today." },
        method: { type: "string", enum: ["cash", "bank_transfer", "check"] },
        bank: { type: "string" },
      },
      required: ["transaction_id", "amount"],
    },
  },
];

export function toolsFor(role: Role): Anthropic.Tool[] {
  return role === "executive" ? AGENT_TOOLS : AGENT_TOOLS.filter((t) => !EXEC_ONLY.has(t.name));
}

// --- helpers ------------------------------------------------------------------------------

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function resolvePeriod(raw: unknown, now: Date): string {
  const s = String(raw ?? "this_month");
  if (s === "all") return "all";
  if (s === "last_month") return monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  return monthKey(now);
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const inPeriod = (e: Entry, p: string) => p === "all" || monthOf(e) === p;
const today = (now: Date) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const json = (x: unknown) => JSON.stringify(x);

function productNamed(view: AgentView, name: string): Product | undefined {
  return findProduct(view.products, name) ?? view.products.find((p) => fullName(p, view.products).toLowerCase() === name.trim().toLowerCase());
}
function priceOf(view: AgentView, p: Product): number {
  return effectiveProductPrice(p, productCostPerJar(p, view.ctx));
}
function row(e: Entry, view: AgentView) {
  return {
    id: e.id,
    date: e.timestamp.slice(0, 10),
    type: e.type,
    item: e.sku,
    quantity_sold: quantitySold(e),
    products: e.lineItems?.map((l) => ({ name: l.name, quantity: l.quantity, unit_price: l.unitPrice })),
    counterparty: e.counterparty,
    amount: e.amount,
    category: e.category,
    ...(view.role === "executive" && canBeOwed(e)
      ? { payment: termOf(e), still_owed: termOf(e) === "spot" ? 0 : outstanding(e), status: statusOf(e), due: e.dueDate ?? null }
      : {}),
    recorded_by: e.loggedByName ?? null,
  };
}

// --- tools -------------------------------------------------------------------------------

export function runTool(name: string, input: Record<string, unknown>, view: AgentView): ToolOutcome {
  if (EXEC_ONLY.has(name) && view.role !== "executive") {
    return { result: json({ error: "That information is only available to an Executive profile." }), isError: true };
  }
  const entries = view.data.entries;
  const now = view.now;

  switch (name) {
    case "business_overview": {
      const p = resolvePeriod(input.period, now);
      const s = summarize(entries, p, now);
      if (view.role !== "executive") {
        return { result: json({ period: p, sales: s.sales, units_sold: expandOrderLines(entries.filter((e) => e.type === "SALE" && inPeriod(e, p))).reduce((n, e) => n + (e.quantity ?? 0), 0), note: "Your profile sees sales and spoilage only." }) };
      }
      return {
        result: json({
          period: p,
          money_received: s.moneyIn,
          of_which_capital_put_in: s.capitalIn,
          money_paid: s.moneyOut,
          of_which_long_term_assets: s.assetsOut,
          sales: s.sales,
          expenses: s.expenses,
          spoilage_at_cost: s.spoiled,
          money_earned: s.earned,
          still_owed_to_us: s.receivables,
          we_still_owe: s.payables,
          overdue_receivables: s.overdueReceivables,
          overdue_payables: s.overduePayables,
          definitions:
            "money_received/money_paid are cash that moved in the period (payments counted when made). money_earned = sales − expenses − spoilage, paid or not. Capital is money in but not a sale; long-term assets are money out but not expenses; neither is in money_earned.",
        }),
      };
    }
    case "money_owed": {
      const dir = input.direction === "we_owe" ? "we_owe" : "owed_to_us";
      const only = String(input.only ?? "all");
      const rows = entries
        .filter((e) => (dir === "owed_to_us" ? e.type === "SALE" : e.type === "EXPENSE" || e.type === "ASSET"))
        .filter((e) => outstanding(e) > 0)
        .filter((e) => (only === "overdue" ? dueInfo(e, now).overdue : only === "defaulted" ? statusOf(e) === "defaulted" : true))
        .map((e) => {
          const due = dueInfo(e, now);
          return {
            id: e.id,
            who: e.counterparty,
            for: e.sku,
            date: e.timestamp.slice(0, 10),
            amount: e.amount,
            paid_so_far: paidSoFar(e),
            still_owed: outstanding(e),
            due: e.dueDate ?? null,
            overdue_days: due.overdue ? -(due.daysLeft ?? 0) : 0,
            status: statusOf(e),
          };
        });
      return { result: json({ direction: dir, count: rows.length, total_still_owed: r2(rows.reduce((s, x) => s + x.still_owed, 0)), rows }) };
    }
    case "product_sales": {
      const p = resolvePeriod(input.period, now);
      const lines = expandOrderLines(entries.filter((e) => e.type === "SALE" && inPeriod(e, p)));
      const by = new Map<string, { product: string; units: number; revenue: number }>();
      for (const e of lines) {
        const product = findProduct(view.products, e.sku);
        const key = product ? fullName(product, view.products) : (e.sku ?? "Unnamed");
        const cur = by.get(key) ?? { product: key, units: 0, revenue: 0 };
        cur.units += e.quantity ?? 0;
        cur.revenue = r2(cur.revenue + (e.amount ?? 0));
        by.set(key, cur);
      }
      const rows = [...by.values()].sort((a, b) => b.revenue - a.revenue);
      return { result: json({ period: p, products: rows, note: rows.length ? "Ranked by revenue; units are also given." : "No sales recorded in this period." }) };
    }
    case "spending": {
      const p = resolvePeriod(input.period, now);
      const cat = input.category ? String(input.category).toLowerCase() : null;
      const exp = entries.filter((e) => e.type === "EXPENSE" && inPeriod(e, p) && (!cat || (e.category ?? "").toLowerCase() === cat || (EXPENSE_CATEGORY_LABELS[e.category ?? ""] ?? "").toLowerCase() === cat));
      const byCat = new Map<string, number>();
      for (const e of exp) byCat.set(EXPENSE_CATEGORY_LABELS[e.category ?? ""] ?? e.category ?? "Uncategorised", r2((byCat.get(EXPENSE_CATEGORY_LABELS[e.category ?? ""] ?? e.category ?? "Uncategorised") ?? 0) + (e.amount ?? 0)));
      const top = [...exp].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 10).map((e) => row(e, view));
      const assets = entries.filter((e) => e.type === "ASSET" && inPeriod(e, p)).map((e) => row(e, view));
      return { result: json({ period: p, total_expenses: r2(exp.reduce((s, e) => s + (e.amount ?? 0), 0)), by_category: Object.fromEntries(byCat), largest: top, long_term_assets_not_expenses: assets }) };
    }
    case "investments": {
      const p = resolvePeriod(input.period, now);
      const inv = entries.filter((e) => isAnyInvestment(e) && inPeriod(e, p));
      const capital = inv.filter((e) => e.type === "CAPITAL").map((e) => ({ date: e.timestamp.slice(0, 10), from: e.counterparty, amount: e.amount }));
      const assets = inv.filter((e) => e.type === "ASSET").map((e) => row(e, view));
      const older = inv.filter((e) => e.type === "RND").map((e) => row(e, view));
      return {
        result: json({
          period: p,
          capital_put_in_total: r2(capital.reduce((s, x) => s + (x.amount ?? 0), 0)),
          capital,
          long_term_assets_total: r2(assets.reduce((s, x) => s + (x.amount ?? 0), 0)),
          long_term_assets: assets,
          older_owner_funded_investments: older,
        }),
      };
    }
    case "products": {
      const rows = view.products.map((p) => {
        const base = { name: fullName(p, view.products), unit: p.unit || "jar", price: r2(priceOf(view, p)), stock: p.stockQty, low_stock: p.lowStockThreshold > 0 && p.stockQty <= p.lowStockThreshold };
        if (view.role !== "executive") return base;
        const cost = productCostPerJar(p, view.ctx);
        const unitCost = costPerUnit(cost.batchTotal, p.batchYield > 0 ? p.batchYield : 1, cost.unpriced.length === 0 && p.recipeIngredients.length > 0);
        return { ...base, cost_per_unit: unitCost, margin_pct: unitCost != null && base.price > 0 ? r2(((base.price - unitCost) / base.price) * 100) : null };
      });
      return { result: json({ products: rows }) };
    }
    case "product_costing": {
      const p = productNamed(view, String(input.product ?? ""));
      if (!p) return { result: json({ error: `No product called "${input.product}". Use the products tool to see the names.` }), isError: true };
      const cost = productCostPerJar(p, view.ctx);
      const complete = cost.unpriced.length === 0 && p.recipeIngredients.length > 0;
      const unitCost = costPerUnit(cost.batchTotal, p.batchYield > 0 ? p.batchYield : 1, complete);
      const price = priceOf(view, p);
      return {
        result: json({
          product: fullName(p, view.products),
          units_per_batch: p.batchYield,
          ingredients: cost.ingredientLines.map((l) => ({ name: l.name, quantity: l.quantityPerBatch, unit: l.unit, cost_per_unit: r2(l.unitCost), subtotal: r2(l.batchCost) })),
          packaging: cost.packagingLines.map((l) => ({ name: l.name, quantity: l.quantityPerBatch, unit: l.unit, subtotal: r2(l.batchCost) })),
          ingredient_total: r2(cost.ingredientTotal),
          packaging_total: r2(cost.packagingTotal),
          labor: r2(cost.laborTotal),
          fixed_costs: r2(cost.miscTotal),
          batch_cost: r2(cost.batchTotal),
          cost_per_unit: unitCost,
          price: r2(price),
          margin_pct: unitCost != null && price > 0 ? r2(((price - unitCost) / price) * 100) : null,
          missing_costs: cost.unpriced,
          note: complete ? undefined : "The cost is incomplete — say what's missing rather than quoting a cost.",
        }),
      };
    }
    case "find_transactions": {
      const p = input.period ? resolvePeriod(input.period, now) : "all";
      const t = String(input.type ?? "any");
      const typeMap: Record<string, EntryType> = { sale: "SALE", expense: "EXPENSE", spoilage: "WASTE", capital: "CAPITAL", asset: "ASSET" };
      const q = String(input.text ?? "").trim().toLowerCase();
      const limit = Math.min(50, Math.max(1, Number(input.limit) || 15));
      const rows = entries
        .filter((e) => ["SALE", "EXPENSE", "WASTE", "CAPITAL", "ASSET", "RND"].includes(e.type))
        .filter((e) => t === "any" || e.type === typeMap[t])
        .filter((e) => inPeriod(e, p))
        .filter((e) => !q || [e.sku, e.counterparty, e.notes, e.category].join(" ").toLowerCase().includes(q))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, limit)
        .map((e) => row(e, view));
      return { result: json({ count: rows.length, rows }) };
    }
    case "prepare_transaction":
      return prepareTransaction(input, view);
    case "prepare_payment":
      return preparePayment(input, view);
    default:
      return { result: json({ error: `Unknown tool ${name}` }), isError: true };
  }
}

function prepareTransaction(input: Record<string, unknown>, view: AgentView): ToolOutcome {
  const now = view.now;
  const type = String(input.type);
  if (view.role !== "executive" && !["sale", "expense", "spoilage", "batch_made"].includes(type)) {
    return { result: json({ error: "Your profile can record sales, everyday expenses, spoilage and batches only." }), isError: true };
  }
  if (view.role !== "executive" && type === "expense" && PAYROLL_CATEGORIES.has(String(input.category ?? "").trim().toLowerCase())) {
    return { result: json({ error: "Salaries are recorded by an Executive." }), isError: true };
  }
  if (!["sale", "expense", "spoilage", "batch_made", "capital", "asset"].includes(type)) {
    return { result: json({ error: "Unknown transaction type." }), isError: true };
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date ?? "")) ? String(input.date) : today(now);
  const [y, m, d] = date.split("-").map(Number);
  const timestamp = new Date(y, m - 1, d, now.getHours(), now.getMinutes()).toISOString();
  const items = Array.isArray(input.items) ? (input.items as { product?: string; quantity?: number; unit_price?: number }[]) : [];
  const stated: string[] = ["type"];
  // Everything still needed, asked for together — never one gap at a time, and never guessed.
  const missing: string[] = [];

  const draft: EntryDraft = {
    timestamp,
    type: "SALE",
    amount: null,
    quantity: null,
    unit: null,
    sku: null,
    counterparty: typeof input.counterparty === "string" && input.counterparty.trim() ? input.counterparty.trim() : null,
    location: null,
    priceType: null,
    category: null,
    rawText: "Prepared by BAi",
    confidence: 1,
    notes: typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null,
  };
  if (draft.counterparty) stated.push("counterparty");
  if (input.date) stated.push("timestamp");

  /** The product they meant, or a question that pins it down. */
  const resolve = (typed: string): Product | null => {
    const r = resolveProduct(view.products, typed);
    if (r.kind === "one") return r.product;
    if (r.kind === "several") missing.push(`Which "${typed}" — ${r.options.map((p) => fullName(p, view.products)).join(", or ")}?`);
    else missing.push(`"${typed}" doesn't match a product. The products are: ${r.suggestions.map((p) => fullName(p, view.products)).join("; ")}.`);
    return null;
  };

  if (type === "sale") {
    const lines: OrderLine[] = [];
    if (items.length === 0) missing.push("Which products, and how many of each?");
    for (const it of items) {
      const p = resolve(String(it.product ?? ""));
      if (!p) continue;
      const name = fullName(p, view.products);
      if (!(Number(it.quantity) > 0)) {
        missing.push(`How many ${name}?`);
        continue;
      }
      const unitPrice = it.unit_price != null && Number(it.unit_price) >= 0 ? Number(it.unit_price) : priceOf(view, p);
      if (!(unitPrice > 0) && it.unit_price == null) missing.push(`${name} has no selling price yet — how much was it each?`);
      const same = lines.find((l) => l.productId === p.id && l.unitPrice === r2(unitPrice));
      if (same) same.quantity += Number(it.quantity);
      else lines.push({ productId: p.id, name, quantity: Number(it.quantity), unitPrice: r2(unitPrice) });
    }
    if (!draft.counterparty) missing.push("Who bought it? (the buyer's name)");
    if (lines.length) {
      Object.assign(draft, {
        type: "SALE",
        priceType: "standard",
        lineItems: lines,
        quantity: orderQuantity(lines),
        sku: lines.length === 1 ? lines[0].name : describeOrder(lines),
        unit: lines.length === 1 ? (view.products.find((p) => p.id === lines[0].productId)?.unit ?? null) : null,
        amount: Number(input.amount) > 0 ? r2(Number(input.amount)) : orderTotal(lines),
      });
      stated.push("sku", "quantity");
      if (Number(input.amount) > 0 || items.some((i) => i.unit_price != null)) stated.push("amount");
    }
  } else if (type === "spoilage" || type === "batch_made") {
    draft.type = type === "spoilage" ? "WASTE" : "INVENTORY_IN";
    const it = items[0];
    const p = it ? resolve(String(it.product ?? "")) : null;
    if (!it) missing.push("Which product?");
    if (p) Object.assign(draft, { sku: p.name, unit: p.unit ?? null });
    if (it && Number(it.quantity) > 0) {
      draft.quantity = Number(it.quantity);
      stated.push("sku", "quantity");
    } else if (p) missing.push(`How many ${fullName(p, view.products)}?`);
  } else if (type === "expense" || type === "asset") {
    const what = String(input.description ?? "").trim();
    draft.type = type === "asset" ? "ASSET" : "EXPENSE";
    draft.category = type === "expense" ? String(input.category ?? "misc") : null;
    if (what) draft.sku = what;
    else missing.push(type === "asset" ? "What was bought?" : "What was the expense for?");
    if (Number(input.amount) > 0) draft.amount = r2(Number(input.amount));
    else missing.push("How much was it?");
    if (type === "expense" && !draft.counterparty) missing.push("Who was it paid to?");
    stated.push("sku", "amount");
    if (input.category) stated.push("category");
  } else if (type === "capital") {
    Object.assign(draft, { type: "CAPITAL", sku: "Capital put in" });
    if (!draft.counterparty) missing.push("Who put the money in?");
    if (Number(input.amount) > 0) draft.amount = r2(Number(input.amount));
    else missing.push("How much was put in?");
    stated.push("amount");
  }

  // Payment, for executives — employees never set payment terms.
  if (view.role === "executive" && ["SALE", "EXPENSE", "ASSET", "CAPITAL"].includes(draft.type)) {
    const method: PaymentMethod = input.method === "bank_transfer" || input.method === "check" ? (input.method as PaymentMethod) : "cash";
    const bank = String(input.bank ?? "").trim();
    if (method === "bank_transfer" && !bank) missing.push("Which bank was it sent through?");
    const later = input.paid_now === false && draft.type !== "CAPITAL";
    Object.assign(draft, {
      paymentMethod: input.method ? method : null,
      bankName: (method === "bank_transfer" || method === "check") && bank ? bank : null,
      paymentTerm: later ? (draft.type === "SALE" ? "receivable" : "payable") : "spot",
      dueDate: later && /^\d{4}-\d{2}-\d{2}$/.test(String(input.due_date ?? "")) ? String(input.due_date) : null,
      paymentStatus: later ? "pending" : null,
    });
    if (input.paid_now !== undefined) stated.push("paymentTerm");
  }

  const summary = {
    type: draft.type,
    products: draft.lineItems?.map((l) => ({ name: l.name, quantity: l.quantity, unit_price: l.unitPrice, subtotal: r2(l.quantity * l.unitPrice) })),
    item: draft.sku,
    quantity: draft.quantity,
    amount: draft.amount,
    counterparty: draft.counterparty,
    date,
    payment: draft.paymentTerm ?? "spot",
    method: draft.paymentMethod ?? null,
  };

  if (missing.length) {
    return {
      result: json({
        ok: false,
        missing,
        understood_so_far: summary,
        instruction:
          "Not ready to record. Ask the person for everything in `missing` in one short message (a numbered list if more than one), recapping what you understood so far. A form with what you have is shown so they can fill the gaps by hand instead. When they answer, call prepare_transaction again with everything.",
      }),
      isError: true,
      proposal: { kind: "incomplete", draft, missing },
    };
  }

  return {
    result: json({ ok: true, shown_for_confirmation: true, summary, instruction: "Recap it briefly for the person (each product with quantity and price, the total, who, and how it was paid) and ask them to check the card and press Log, or Change to edit it." }),
    proposal: { kind: "transaction", draft, stated },
  };
}

function preparePayment(input: Record<string, unknown>, view: AgentView): ToolOutcome {
  const e = view.data.entries.find((x) => x.id === String(input.transaction_id));
  if (!e || !canBeOwed(e) || termOf(e) === "spot") return { result: json({ error: "That isn't a payable or receivable. Find it with money_owed first." }), isError: true };
  const owed = outstanding(e);
  const amount = Number(input.amount);
  if (!(amount > 0)) return { result: json({ error: "How much was paid?" }), isError: true };
  if (owed <= 0) return { result: json({ error: "Nothing is owed on that one any more." }), isError: true };
  const method: PaymentMethod = input.method === "bank_transfer" || input.method === "check" ? (input.method as PaymentMethod) : "cash";
  if (method === "bank_transfer" && !String(input.bank ?? "").trim()) return { result: json({ error: "Which bank?" }), isError: true };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date ?? "")) ? String(input.date) : today(view.now);
  const change = addPayment(e, { date, amount: Math.min(amount, owed), method, bankName: method === "bank_transfer" ? String(input.bank).trim() : null }, {}, view.now);
  if (!change.ok) return { result: json({ error: change.reason }), isError: true };
  const patch = change.patch;
  const who = e.counterparty ?? (e.type === "SALE" ? "the customer" : "the supplier");
  const summary = `${e.type === "SALE" ? `₱${Math.min(amount, owed).toLocaleString()} received from ${who}` : `₱${Math.min(amount, owed).toLocaleString()} paid to ${who}`} on ${date} for ${e.sku ?? "this transaction"} — ₱${r2(owed - Math.min(amount, owed)).toLocaleString()} still owed after this.`;
  return { result: json({ ok: true, shown_for_confirmation: true, summary }), proposal: { kind: "payment", entryId: e.id, summary, patch } };
}

/**
 * How this person usually works, from what they themselves have recorded — the products they
 * sell most, their regular buyers and payees, how they're usually paid — so BAi can fill the
 * obvious gaps the way they would ("the usual for Aling Nena") and ask fewer questions.
 */
export function habitsOf(entries: Entry[], userId: string, role: Role): string | null {
  const mine = entries.filter((e) => e.loggedById === userId);
  if (mine.length < 3) return null;
  const top = (list: (string | null | undefined)[], n = 5) => {
    const counts = new Map<string, number>();
    for (const x of list) if (x && x.trim()) counts.set(x.trim(), (counts.get(x.trim()) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).filter(([, c]) => c >= 2);
  };
  const sales = mine.filter((e) => e.type === "SALE");
  const products = top(sales.flatMap((e) => (e.lineItems?.length ? e.lineItems.map((l) => l.name) : [e.sku])));
  const buyers = top(sales.map((e) => e.counterparty));
  const expenses = mine.filter((e) => e.type === "EXPENSE");
  const payees = top(expenses.map((e) => (e.counterparty ? `${e.counterparty} (${EXPENSE_CATEGORY_LABELS[e.category ?? ""] ?? e.category ?? "expense"})` : null)));
  const methods = role === "executive" ? top(mine.map((e) => (e.paymentMethod === "bank_transfer" ? (e.bankName ? `bank transfer via ${e.bankName}` : "bank transfer") : e.paymentMethod)), 2) : [];
  const usual = (q: number[]) => {
    const sorted = [...q].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  };
  const qty = usual(sales.map((e) => e.quantity ?? 0).filter((n) => n > 0));
  const lines = [
    products.length && `Sells most often: ${products.map(([n]) => n).join(", ")}.`,
    buyers.length && `Regular buyers: ${buyers.map(([n, c]) => `${n} (${c} orders)`).join(", ")}.`,
    qty && `A typical order is about ${qty} units.`,
    payees.length && `Often pays: ${payees.map(([n]) => n).join(", ")}.`,
    methods.length && `Usually paid by ${methods.map(([n]) => n).join(", then ")}.`,
    `Has recorded ${pluralCount(sales.length, "sale")} and ${pluralCount(expenses.length, "expense")}.`,
  ].filter(Boolean);
  return lines.join(" ");
}

const pluralCount = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
