import { formatPeso } from "@/lib/format";
import type { ProductMarginRow } from "@/lib/summary/profit-summary";

/** Ranked by profit contributed, not revenue — a bestseller can still be a poor
 * earner if its margin is thin, and this is the one place that shows up. */
export function ProfitableProductsList({ rows }: { rows: ProductMarginRow[] }) {
  const top = rows.filter((r) => r.revenue > 0).slice(0, 3);
  if (top.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">Most profitable products</h2>
      <div className="divide-y divide-border rounded-2xl border border-border">
        {top.map((row, i) => (
          <div key={row.sku} className="flex items-center justify-between gap-2 px-4 py-3">
            <span className="flex min-w-0 items-center gap-2 text-base font-medium text-foreground">
              <span className="shrink-0 text-muted-foreground">{i + 1}.</span>
              <span className="truncate">{row.sku}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-base font-semibold text-[var(--status-good)]">{formatPeso(row.margin)} profit</span>
              <span className="block text-sm text-muted-foreground">
                {Math.round(row.marginPct)}% margin · {row.qty} jars
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
