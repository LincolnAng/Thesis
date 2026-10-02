"use client";

import { Answer, SectionTitle } from "@/components/inventory/section";
import { StatCard, StatCardGrid } from "@/components/inventory/stat-card";
import { stockLevel } from "@/components/data-table/stock-level";
import { formatNumber, listPhrase, pluralize } from "@/lib/format";
import type { Product, RawMaterialStock } from "@/lib/store/types";

/**
 * What is physically in the shop right now: jars on the shelf, and the materials to make
 * more. Same shape as "What to make" — the question in small caps, the answer as one
 * sentence, the figures as tiles.
 *
 * "Running low" here means what it means in the summary tile above: below the warning level
 * you set, or below what next month is expected to sell. The two used to disagree — the
 * tile counted both, these tiles counted only the second — so the page could say "2
 * products running low" above a row with nothing marked.
 */

export function ShelfTab({
  products,
  rawMaterials,
  forecastOf,
  salesForecastOf,
  nextMonth,
  onPickProduct,
}: {
  products: Product[];
  rawMaterials: RawMaterialStock[];
  /** Next month's whole demand: expected sales plus any event that month. */
  forecastOf: (id: string) => number;
  /** Just the sales half, so the basis line can show the split. */
  salesForecastOf: (id: string) => number;
  nextMonth: string;
  onPickProduct: (p: Product) => void;
}) {
  // Whatever is closest to running out comes first.
  const rows = products
    .map((p) => {
      const need = forecastOf(p.id);
      return { p, need, spare: p.stockQty - need, low: p.stockQty <= p.lowStockThreshold || p.stockQty < need };
    })
    .sort(
      (a, b) =>
        Number(b.low) - Number(a.low) || a.p.stockQty / Math.max(1, a.need) - b.p.stockQty / Math.max(1, b.need),
    );

  const jarsOnShelf = products.reduce((sum, p) => sum + p.stockQty, 0);
  const lowProducts = rows.filter((r) => r.low);
  const lowMaterials = rawMaterials.filter((m) => stockLevel(m.qty, m.lowStockThreshold) === "low");

  const jarsSentence = lowProducts.length
    ? `${pluralize(jarsOnShelf, "jar")} on the shelf, but ${listPhrase(lowProducts.map((r) => r.p.name))} ${
        lowProducts.length === 1 ? "is" : "are"
      } running low.`
    : `${pluralize(jarsOnShelf, "jar")} on the shelf.`;

  const materialsSentence = lowMaterials.length
    ? `Running low on ${listPhrase(lowMaterials.map((m) => m.name.toLowerCase()))}.`
    : "Everything you make with is stocked.";


  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-line/15 bg-white p-5">
        <SectionTitle>How much is on the shelf</SectionTitle>
        {products.length === 0 ? (
          <Answer>No products yet.</Answer>
        ) : (
          <Answer tone={lowProducts.length ? "bad" : "good"}>{jarsSentence}</Answer>
        )}

        {rows.length > 0 && (
          <div className="mt-4 border-t border-line/10 pt-3">
            <StatCardGrid>
              {rows.map(({ p, need, spare, low }) => (
                <StatCard
                  key={p.id}
                  label={p.name}
                  value={String(p.stockQty)}
                  unit="jars"
                  flag={low ? "Running low" : undefined}
                  detail={`${nextMonth} needs ${need} (${salesForecastOf(p.id)} expected sales${
                    need - salesForecastOf(p.id) > 0 ? ` + ${need - salesForecastOf(p.id)} for events` : ""
                  }) — ${spare < 0 ? `${-spare} short` : `${spare} spare`}. Warning level ${
                    p.lowStockThreshold
                  }. Click to edit.`}
                  tone={low ? "bad" : "muted"}
                  onClick={() => onPickProduct(p)}
                />
              ))}
            </StatCardGrid>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line/15 bg-white p-5">
        <SectionTitle>How much there is to make with</SectionTitle>
        {rawMaterials.length === 0 ? (
          <Answer>No materials tracked yet.</Answer>
        ) : (
          <Answer tone={lowMaterials.length ? "bad" : "good"}>{materialsSentence}</Answer>
        )}

        {rawMaterials.length > 0 && (
          <div className="mt-4 border-t border-line/10 pt-3">
            <StatCardGrid>
              {rawMaterials.map((m) => {
                const low = stockLevel(m.qty, m.lowStockThreshold) === "low";
                return (
                  <StatCard
                    key={m.id}
                    label={m.name}
                    value={formatNumber(m.qty)}
                    unit={m.unit}
                    flag={low ? "Running low" : undefined}
                    detail={`${formatNumber(m.qty)} ${m.unit} in stock. Warning level ${m.lowStockThreshold} ${m.unit}.`}
                    tone={low ? "bad" : "muted"}
                  />
                );
              })}
            </StatCardGrid>
          </div>
        )}
      </section>
    </div>
  );
}
