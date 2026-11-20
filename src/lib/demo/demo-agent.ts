import { runTool, type AgentView, type Proposal } from "@/lib/ai/agent-tools";

/**
 * BAi for the demo site, without any AI: a plain reader for the handful of sentences people
 * try first ("sold 3 tablea to Liza", "paid 500 for delivery", "how much did we sell this
 * month?"). Everything after the reading is the real thing — the same prepare_transaction that
 * BAi uses, so the confirm card, the product matching, the role rules and the save path are all
 * the app's own.
 */

const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;

/** The live system's BAi, in one paragraph — said when the demo can't tell what was meant. */
export const DEMO_HELP =
  "This is the demo, so BAi runs without its AI here — it understands simple messages only. Try:\n\n" +
  "- \"Sold 3 tablea 150g to Liza, gcash\"\n" +
  "- \"Sold 2 brandy and 5 ice cream cups to Mark\"\n" +
  "- \"Paid 450 for delivery to Kuya Jun\"\n" +
  "- \"5 ice cream cups melted\"\n" +
  "- \"How much did we sell this month?\" · \"Who still owes us?\" · \"What sells best?\"\n\n" +
  "In the live system BAi understands anything typed or said in English, Tagalog or Bisaya, and answers questions from the shop's own records.";

const METHOD: [RegExp, string, string | null][] = [
  [/\b(g-?cash|maya|e-?wallet)\b/i, "ewallet", "GCash"],
  [/\b(cheque|check)\b/i, "check", null],
  [/\b(bpi|bdo|metrobank|landbank|security bank|bank)\b/i, "bank_transfer", null],
  [/\bcash\b/i, "cash", null],
];

const CATEGORY: [RegExp, string][] = [
  [/\b(sweldo|salary|salaries|wage|payroll)\b/i, "labor"],
  [/\b(beans?|cacao|sugar|milk|gatas|cream|vanilla|ingredients?)\b/i, "raw_materials"],
  [/\b(pouch(es)?|stickers?|labels?|cups?|bottles?|tubs?|boxes|packaging|tape)\b/i, "packaging"],
  [/\b(fare|delivery|grab|lalamove|courier|transport|gas|tricycle|jeep)\b/i, "transport"],
  [/\b(flyers?|ads?|boost|printing|marketing|photos?)\b/i, "Printing & marketing"],
  [/\b(electric(ity)?|water|internet|rent|wifi)\b/i, "misc"],
];

/** "3 tablea 150g and 2 brandy" → [{ product: "tablea 150g", quantity: 3 }, …]. */
function readItems(text: string): { product: string; quantity: number }[] {
  const body = text
    .replace(/\b(sold|sell|benta|nabenta|order(ed)?|made|produced|batch(es)? of|spoiled|spoilt|melted|expired|nadaot|wasted?)\b/gi, " ")
    .split(/\b(?:to|for|kay|via|thru|through|paid|bayad)\b|₱|\bphp\b/i)[0];
  const items: { product: string; quantity: number }[] = [];
  for (const part of body.split(/,|\band\b|\bug\b|\bat\b|\+/i)) {
    const m = part.match(/(\d+(?:\.\d+)?)\s*(?:x\s+|pcs?\.?\s+|pieces?\s+(?:of\s+)?)?(.*)/i);
    if (!m) continue;
    let [, qty, rest] = m;
    // "3 150g tablea": the size belongs to the product, not the count.
    rest = rest.trim();
    if (/^(g|kg|grams?|oz)\b/i.test(rest)) continue;
    if (!/[a-z]/i.test(rest)) continue;
    items.push({ product: rest.replace(/\s+/g, " ").trim(), quantity: Number(qty) });
  }
  return items;
}

function readAmount(text: string): number | null {
  const m = text.match(/(?:₱|\bphp\s?|\bp\s?)([\d,]+(?:\.\d+)?)/i) ?? text.match(/\b(?:for|total|amounting to|worth)\s+([\d,]+(?:\.\d+)?)\b(?!\s*(?:g|kg|oz|pcs?|cups?|packs?|bottles?|pints?))/i) ?? text.match(/\b([\d,]+(?:\.\d+)?)\s*(?:pesos?|php)\b/i);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

function readWho(text: string, words: string): string | null {
  const m = text.match(new RegExp(`\\b(?:${words})\\s+([A-Za-z][\\w'.-]*(?:\\s+(?!for\\b|via\\b|thru\\b|cash\\b|gcash\\b|paid\\b|using\\b|by\\b|on\\b)[A-Za-z][\\w'.-]*){0,3})`, "i"));
  if (!m) return null;
  return m[1].replace(/\s+(today|yesterday|cash|gcash)$/i, "").trim() || null;
}

function payment(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [re, method, bank] of METHOD) {
    const m = text.match(re);
    if (m) {
      out.method = method;
      out.bank = bank ?? (method === "bank_transfer" && !/^bank$/i.test(m[1]) ? m[1].toUpperCase() : undefined);
      break;
    }
  }
  if (/\b(utang|pay later|pays later|on credit|credit|receivable|payable|not yet paid|unpaid)\b/i.test(text)) out.paid_now = false;
  return out;
}

function answer(view: AgentView, text: string): string | null {
  const lastMonth = /\blast month|noong nakaraang buwan|miaging bulan\b/i.test(text);
  const period = lastMonth ? "last_month" : "this_month";
  const label = lastMonth ? "last month" : "this month";
  if (/\b(owe|owes|owed|utang|receivables?|payables?|collect)\b/i.test(text)) {
    const weOwe = /\b(we owe|do we owe|payables?|our debts?)\b/i.test(text);
    const r = runTool("money_owed", { direction: weOwe ? "we_owe" : "owed_to_us" }, view);
    const j = JSON.parse(r.result) as { error?: string; total_still_owed?: number; rows?: { who: string | null; still_owed: number; due: string | null; overdue_days: number }[] };
    if (j.error) return j.error;
    if (!j.rows?.length) return weOwe ? "The shop doesn't owe anyone right now." : "Nobody owes the shop anything right now.";
    const lines = j.rows.slice(0, 6).map((x) => `- ${x.who ?? "Someone"}: ${peso(x.still_owed)}${x.overdue_days > 0 ? ` (${x.overdue_days} days overdue)` : x.due ? ` (due ${x.due})` : ""}`);
    return `${weOwe ? "The shop still owes" : "Still owed to the shop"}: ${peso(j.total_still_owed ?? 0)} in total.\n\n${lines.join("\n")}`;
  }
  if (/\b(best|top|most|popular|sells? best|best ?sell)/i.test(text)) {
    const r = runTool("product_sales", { period: /\b(all time|ever|overall)\b/i.test(text) ? "all" : period }, view);
    const j = JSON.parse(r.result) as { products: { product: string; units: number; revenue: number }[] };
    if (!j.products.length) return `No sales recorded ${label} yet.`;
    return `Best sellers ${label}, by sales:\n\n${j.products.slice(0, 5).map((p, i) => `${i + 1}. ${p.product} — ${peso(p.revenue)} (${p.units} sold)`).join("\n")}`;
  }
  if (/\b(how much|magkano|pila|sales?|sold|sell|earn|earned|profit|kita|expenses?|spent|gastos)\b/i.test(text) && /\?|how much|magkano|pila|what|ilan|how/i.test(text)) {
    const r = runTool("business_overview", { period }, view);
    const j = JSON.parse(r.result) as { sales: number; units_sold?: number; expenses?: number; money_earned?: number; still_owed_to_us?: number; note?: string };
    if (j.expenses === undefined) return `Sales ${label}: ${peso(j.sales)}${j.units_sold ? `, ${j.units_sold} items sold` : ""}. (An Employee profile sees sales only.)`;
    return `${label[0].toUpperCase()}${label.slice(1)}: sales ${peso(j.sales)}, expenses ${peso(j.expenses)}, so ${peso(j.money_earned ?? 0)} earned. Customers still owe ${peso(j.still_owed_to_us ?? 0)}.`;
  }
  return null;
}

/** What /api/agent sends back in the demo: a reply, and a card to confirm when something's to be recorded. */
export function demoAgentReply(view: AgentView, text: string): { reply: string; proposal: Proposal | null } {
  const t = text.trim();
  const isQuestion = /\?\s*$/.test(t) || /^(how|what|who|which|when|magkano|pila|ilan|sino)\b/i.test(t);

  const type = isQuestion
    ? null
    : /\b(spoiled|spoilt|melted|expired|nadaot|wasted?|nasira|broke|cracked)\b/i.test(t)
      ? "spoilage"
      : /\b(made|produced|batch|gihimo|niluto)\b/i.test(t)
        ? "batch_made"
        : /\b(sold|sell|benta|nabenta|binenta|order(ed)?)\b/i.test(t)
          ? "sale"
          : /\b(paid|pay|bought|buy|spent|bayad|gastos|purchase[sd]?|expense)\b/i.test(t)
            ? "expense"
            : null;

  if (!type) {
    const a = answer(view, t);
    return { reply: a ?? DEMO_HELP, proposal: null };
  }

  const input: Record<string, unknown> = { type, ...payment(t) };
  if (type === "sale" || type === "spoilage" || type === "batch_made") {
    input.items = readItems(t);
    if (type === "sale") {
      input.counterparty = readWho(t, "to|kay|for");
      const amount = readAmount(t);
      if (amount) input.amount = amount;
    }
  } else {
    const amount = readAmount(t) ?? Number(t.match(/\b(\d[\d,]*(?:\.\d+)?)\b/)?.[1]?.replace(/,/g, "") ?? NaN);
    if (amount > 0) input.amount = amount;
    input.counterparty = readWho(t, "to|from|kay|sa");
    const what = t
      .replace(/\b(paid|pay|bought|buy|spent|bayad|gastos|purchased?|expense)\b/gi, " ")
      .replace(/(?:₱|\bphp\s?)?[\d,]+(?:\.\d+)?\s*(?:pesos?)?/gi, (m) => (/\d\s*(kg|g|l|pcs?)\b/i.test(m) ? m : " "))
      .replace(/\b(?:to|from|kay|sa)\s+[A-Za-z][\w'.-]*(?:\s+[A-Z][\w'.-]*)*/g, " ")
      .replace(/\b(for|on|the|a|an|via|thru|using|by|in|cash|g-?cash|maya|cheque|check|bank|bpi|bdo|today)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (what) input.description = what[0].toUpperCase() + what.slice(1);
    input.category = CATEGORY.find(([re]) => re.test(t))?.[1] ?? "misc";
  }

  const outcome = runTool("prepare_transaction", input, view);
  if (outcome.isError && !outcome.proposal) {
    return { reply: (JSON.parse(outcome.result) as { error?: string }).error ?? DEMO_HELP, proposal: null };
  }
  if (outcome.proposal?.kind === "incomplete") {
    const missing = outcome.proposal.missing;
    return {
      reply: `Almost — I still need:\n\n${missing.map((m, i) => `${i + 1}. ${m}`).join("\n")}\n\nTell me, or fill it in on the form.`,
      proposal: outcome.proposal,
    };
  }
  return { reply: "Here it is — check the card, then press Log to save it (or Change to edit it first).", proposal: outcome.proposal ?? null };
}
