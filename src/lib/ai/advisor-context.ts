/**
 * Everything the advisor needs to give advice about *this* shop rather than about small food
 * businesses in general.
 *
 * The chat assistant already gets a figures summary (see data-summary.ts). That is enough to
 * answer "how much did I make this month" and nowhere near enough to answer "should I start
 * exporting". Answering that needs to know she holds no FDA licence, sells only at bazaars,
 * has two logged sales and no equipment configured — none of which is a figure.
 *
 * The last block is the one that matters most: **what is missing**. A model that cannot see a
 * gap fills it with something plausible. Told plainly that two of three products have no costed
 * recipe, it says so instead of inventing their margins.
 */

import { formatPeso, pluralize } from "@/lib/format";
import { buildDataSummary } from "@/lib/ai/data-summary";
import { deriveCustomers } from "@/lib/summary/customers";
import { productCostPerJar } from "@/lib/summary/recipe-cost";
import { hourlyLaborRateFrom } from "@/lib/summary/use-cost-context";
import {
  CHANNEL_LABELS,
  PERMIT_LABELS,
  activeChannels,
  businessGoals,
  cacaoUtilizationPct,
  hasSeasonality,
  multipliersFor,
  competitorPrices,
  heldPermits,
  seasonNotes,
  shelfLifeDays,
  sourcingProfile,
  type ChannelId,
  type PermitId,
} from "@/lib/summary/business-config";
import { MONTH_LABELS } from "@/lib/summary/seasonality";
import type { StoreState } from "@/lib/store/store";

function monthsOfSalesHistory(state: StoreState): number {
  const months = new Set(
    state.entries.filter((e) => e.type === "SALE").map((e) => e.timestamp.slice(0, 7)),
  );
  return months.size;
}

/** The plain-language stage of the business, which changes what advice is even sensible. */
function stageLines(state: StoreState): string[] {
  const sales = state.entries.filter((e) => e.type === "SALE");
  const customers = deriveCustomers(state.entries);
  const equipmentHours = state.machines.reduce((sum, m) => sum + (m.batchesPerDay > 0 ? 1 : 0), 0);

  return [
    `Sales ever logged: ${sales.length}`,
    `Distinct customers ever: ${customers.length}`,
    `Months with any sales: ${monthsOfSalesHistory(state)}`,
    `Products: ${state.products.length}`,
    `Equipment configured: ${state.machines.length === 0 ? "NONE — nothing can be scheduled on the production calendar" : `${state.machines.length} (${equipmentHours} usable)`}`,
    `Events on the books: ${state.events.filter((e) => e.status === "open").length} open, ${state.events.filter((e) => e.status === "closed").length} closed`,
  ];
}

function permitLines(state: StoreState): string[] {
  const held = new Set<PermitId>(heldPermits(state.businessSettings));
  const all = Object.entries(PERMIT_LABELS) as [PermitId, string][];
  if (held.size === 0) {
    return [
      "Permits: not recorded. Do NOT assume which she holds. If the answer depends on it, search for what the Philippines actually requires for her situation and tell her what to get, rather than asking her to look it up herself.",
    ];
  }
  return [
    `Permits held: ${all.filter(([id]) => held.has(id)).map(([, label]) => label).join(", ") || "none"}`,
    `Permits NOT held: ${all.filter(([id]) => !held.has(id)).map(([, label]) => label).join(", ") || "none"}`,
  ];
}

function channelLines(state: StoreState): string[] {
  const active = new Set<ChannelId>(activeChannels(state.businessSettings));
  if (active.size === 0) return ["Sales channels: not recorded by the owner."];
  const all = Object.entries(CHANNEL_LABELS) as [ChannelId, string][];
  return [
    `Sells through now: ${all.filter(([id]) => active.has(id)).map(([, l]) => l).join(", ")}`,
    `Not selling through: ${all.filter(([id]) => !active.has(id)).map(([, l]) => l).join(", ")}`,
  ];
}

function productLines(state: StoreState): string[] {
  const ctx = {
    rawMaterials: state.rawMaterials,
    supplierPrices: state.supplierPrices,
    hourlyLaborRate: hourlyLaborRateFrom(state.businessSettings),
    cacaoUtilization: cacaoUtilizationPct(state.businessSettings) / 100,
  };
  return state.products.map((p) => {
    const cost = productCostPerJar(p, ctx);
    const margin = p.standardPrice > 0 ? ((p.standardPrice - cost.costPerJar) / p.standardPrice) * 100 : 0;
    const seasonal = hasSeasonality(state.businessSettings, p.id);
    const peak = seasonal
      ? (() => {
          const m = multipliersFor(state.businessSettings, p.id);
          const best = m.indexOf(Math.max(...m));
          return `peaks in ${MONTH_LABELS[best]} at ${m[best].toFixed(2)}x an average month`;
        })()
      : "no seasonal pattern set";
    return (
      `${p.name}: sells ${formatPeso(p.standardPrice)}, costs ${formatPeso(cost.costPerJar)}, ` +
      `margin ${Math.round(margin)}%, ${p.stockQty} in stock, ${p.batchYield} per batch, ` +
      `shelf life ${shelfLifeDays(state.businessSettings, p.id)} days, ${peak}` +
      `${p.recipeIngredients.length === 0 ? " — NO COSTED RECIPE, its cost is a fallback not a calculation" : ""}`
    );
  });
}

function supplierLines(state: StoreState): string[] {
  const sourcing = sourcingProfile(state.businessSettings);
  const lines = state.suppliers.map((s) => {
    const latest = s.priceHistory[s.priceHistory.length - 1];
    return `${s.name}${s.items ? ` (${s.items})` : ""}${latest ? ` — last price ${formatPeso(latest.price)}` : " — no price recorded"}`;
  });
  const materialsWithoutSupplier = state.rawMaterials.filter(
    (m) => !state.suppliers.some((s) => s.items?.toLowerCase().includes(m.name.toLowerCase())),
  );
  return [
    `Suppliers: ${lines.join(" | ") || "none recorded"}`,
    `Materials with no supplier on file: ${materialsWithoutSupplier.map((m) => m.name).join(", ") || "none"}`,
    `Bean source type: ${sourcing.beanSource || "not recorded"}`,
    `Single-sourced (one supplier failing stops production): ${sourcing.singleSourced ? "yes" : "no"}`,
    sourcing.storageNotes ? `Storage notes: ${sourcing.storageNotes}` : "Storage limits: not recorded",
  ];
}

function marketLines(state: StoreState): string[] {
  const rows = competitorPrices(state.businessSettings);
  if (rows.length === 0) {
    return [
      "Competitor prices: none recorded. Search for what comparable products actually sell for rather than guessing or telling her to go and check.",
    ];
  }
  return [
    `Competitor prices the owner recorded: ${rows
      .map((r) => `${r.name} ${r.sizeG}g at ${formatPeso(r.pricePhp)}${r.whereSeen ? ` (${r.whereSeen})` : ""}`)
      .join(" | ")}`,
  ];
}

/**
 * What the data does not contain. Written as instructions rather than observations, because a
 * gap stated as a fact is still a gap a model will cheerfully fill.
 */
function gapLines(state: StoreState): string[] {
  const gaps: string[] = [];

  const uncosted = state.products.filter((p) => p.recipeIngredients.length === 0);
  if (uncosted.length > 0) {
    gaps.push(
      `${uncosted.map((p) => p.name).join(" and ")} have no costed recipe. Their margins above are NOT calculated — do not present them as reliable.`,
    );
  }

  const noMinutes = state.products.filter((p) => !p.minutesPerBatch);
  if (noMinutes.length > 0) {
    gaps.push(
      `Labour is recorded as zero for ${noMinutes.map((p) => p.name).join(", ")}, so every margin shown is better than reality.`,
    );
  }

  const utilization = cacaoUtilizationPct(state.businessSettings);
  if (utilization < 60) {
    gaps.push(
      `Cacao utilization is set to ${utilization}%, which is low and may never have been measured. It drives most of the ingredient cost, so if it is wrong every cost and margin here is wrong with it.`,
    );
  }

  if (monthsOfSalesHistory(state) < 3) {
    gaps.push(
      `Fewer than 3 months of sales are logged, so any forecast is a weak estimate. The seasonal SHAPE is set by the owner and can be trusted; the SIZE cannot.`,
    );
  }

  if (state.machines.length === 0) {
    gaps.push("No equipment is configured, so the production calendar cannot schedule anything.");
  }

  const notes = seasonNotes(state.businessSettings);
  gaps.push(
    notes
      ? `Owner's own notes on seasons and harvests: ${notes}`
      : "No local harvest or wet/dry season notes recorded. Search for the Philippine cacao harvest calendar if timing matters to the answer.",
  );

  return gaps;
}

/** The full advisory briefing. Sent as the dynamic half of the advisor's system prompt. */
export function buildAdvisorContext(state: StoreState): string {
  const goals = businessGoals(state.businessSettings);

  const sections: [string, string[]][] = [
    ["WHERE THE BUSINESS IS", stageLines(state)],
    ["WHAT SHE SELLS", productLines(state)],
    ["PERMITS AND REGISTRATIONS", permitLines(state)],
    ["CHANNELS", channelLines(state)],
    ["SUPPLY", supplierLines(state)],
    ["MARKET", marketLines(state)],
    ["WHAT IS MISSING OR UNVERIFIED", gapLines(state)],
  ];

  const blocks = sections.map(([title, lines]) => `## ${title}\n${lines.map((l) => `- ${l}`).join("\n")}`);

  if (goals) blocks.unshift(`## WHAT SHE IS TRYING TO DO\n- ${goals}`);

  // The existing figures summary still carries revenue, expenses, margin and top sellers.
  blocks.push(`## CURRENT FIGURES\n${buildDataSummary(state)}`);

  return blocks.join("\n\n");
}

/** A one-line read of the stage, used by the sharpener to make suggestions fit. */
export function stageHeadline(state: StoreState): string {
  const sales = state.entries.filter((e) => e.type === "SALE").length;
  const customers = deriveCustomers(state.entries).length;
  if (sales <= 5) return `pre-traction: ${pluralize(sales, "sale")} ever, ${pluralize(customers, "customer")}`;
  if (monthsOfSalesHistory(state) < 6) return `early: ${pluralize(sales, "sale")} logged across a few months`;
  return `established: ${pluralize(sales, "sale")} logged, ${pluralize(customers, "customer")}`;
}
