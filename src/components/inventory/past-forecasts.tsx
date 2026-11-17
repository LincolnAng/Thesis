"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/production/process-plan";
import { CarouselNav } from "@/components/ui/carousel-nav";
import { useStore } from "@/lib/store/use-store";
import { pastForecast, pastForecastMonths } from "@/lib/summary/forecast";
import { multipliersFor } from "@/lib/summary/business-config";
import { fullName } from "@/lib/summary/product-sizes";
import { formatPeso } from "@/lib/format";

const monthName = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

/**
 * How the forecast did in the months already gone: what it said on the first of the month —
 * from the sales before it only, exactly as it would have then — beside what sold. A forecast
 * nobody can check is a forecast nobody should plan on; this is the check.
 */
export function PastForecasts() {
  const { products, entries, businessSettings } = useStore();
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const months = pastForecastMonths(entries, now);
  // Last month by default: the latest one that's over.
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked && months.includes(picked) ? picked : (months.filter((m) => m < thisMonth).at(-1) ?? months.at(-1) ?? null);
  const i = month ? months.indexOf(month) : -1;

  const result = useMemo(
    () => (month ? pastForecast(month, products, entries, (id) => multipliersFor(businessSettings, id)) : null),
    [month, products, entries, businessSettings],
  );

  const nameOf = (id: string, fallback: string) => {
    const p = products.find((x) => x.id === id);
    return p ? fullName(p, products) : fallback;
  };
  const unitOf = (id: string) => products.find((x) => x.id === id)?.unit ?? "";
  const inProgress = month === thisMonth;

  return (
    <Panel
      title="How past forecasts did"
      note="What the forecast said on the 1st of each month — from the sales before it only — against what sold."
      aside={
        months.length > 0 && month ? (
          <CarouselNav
            label={monthName(month)}
            labelWidth="w-[150px]"
            position={{ index: i, count: months.length }}
            onPrev={() => setPicked(months[i - 1])}
            onNext={() => setPicked(months[i + 1])}
            atStart={i <= 0}
            atEnd={i >= months.length - 1}
            prevLabel="Earlier month"
            nextLabel="Later month"
          />
        ) : undefined
      }
    >
      {!result || !month ? (
        <p className="text-[13px] text-muted-foreground">Once there are two months of sales, each month after the first shows here with what was forecast for it.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-4">
            <Figure label="Units forecast" value={Math.round(result.forecast).toLocaleString()} />
            <Figure label={inProgress ? "Units sold so far" : "Units sold"} value={result.sold.toLocaleString()} />
            <Figure
              label="Missed, product by product"
              value={Math.round(result.missed).toLocaleString()}
              // A share of a handful of sales reads as thousands of percent and means nothing.
              note={result.sold >= 20 ? `${Math.round((result.missed / result.sold) * 100)}% of what sold` : result.sold > 0 ? "Too few sales recorded to compare" : undefined}
            />
            <Figure
              label={inProgress ? "Sales forecast · so far" : "Sales forecast · actual"}
              value={result.revenueForecast === null ? "—" : formatPeso(Math.round(result.revenueForecast))}
              note={formatPeso(Math.round(result.revenueSold))}
            />
          </div>

          {result.rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nothing was forecast or sold in {monthName(month)}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-[13px]">
                <thead>
                  <tr className="border-b border-line/10 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 pr-3 font-bold">Product</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Forecast</th>
                    <th className="py-1.5 pr-3 text-right font-bold">{inProgress ? "Sold so far" : "Sold"}</th>
                    <th className="py-1.5 text-right font-bold">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => {
                    const diff = Math.round(r.forecast) - r.sold;
                    return (
                      <tr key={r.productId} className="border-b border-line/10 last:border-0">
                        <td className="py-1.5 pr-3">{nameOf(r.productId, r.productName)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {Math.round(r.forecast)} <span className="text-muted-foreground">{unitOf(r.productId)}</span>
                        </td>
                        <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{r.sold}</td>
                        <td className={`py-1.5 text-right tabular-nums ${diff === 0 ? "text-muted-foreground" : "font-semibold"}`}>
                          {diff === 0 ? "On the mark" : diff > 0 ? `${diff} over` : `${-diff} under`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[12px] text-muted-foreground">
            {inProgress
              ? "This month isn't over, so what sold is only so far."
              : "A month with sales missing from the records shows as a big miss — check Transactions for that month first."}
          </p>
        </div>
      )}
    </Panel>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
      <div className="text-[11.5px] font-semibold text-muted-foreground">{label}</div>
      <div className="font-display text-[20px] font-semibold tabular-nums">{value}</div>
      {note && <div className="text-[11.5px] text-muted-foreground">{note}</div>}
    </div>
  );
}
