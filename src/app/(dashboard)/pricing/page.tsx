"use client";

import { Fragment, useMemo, useState } from "react";
import { Calculator, ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PricingCalculatorCard } from "@/components/finance/pricing-calculator-card";
import { SimplePricingDialog } from "@/components/finance/simple-pricing-dialog";
import { IngredientCostsPanel } from "@/components/finance/ingredient-costs-panel";
import { BigRowList } from "@/components/data-table/big-row-list";
import { formatPeso, pluralize, PRICING_MODE_LABELS } from "@/lib/format";
import { useStore } from "@/lib/store/use-store";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { buildPricingRows, PRICING_WINDOW_DAYS } from "@/lib/summary/pricing-reality";
import { useViewMode } from "@/lib/summary/view-mode";
import { cn } from "@/lib/utils";

export default function PricingPage() {
  const { products, entries } = useStore();
  const [viewMode] = useViewMode();
  const costCtx = useCostContext();
  // Tracked by id, not the Product object itself — the dialog saves each field
  // instantly as it's edited (no explicit Save step), so it must keep reading
  // the live product from the store rather than a snapshot that goes stale the
  // moment the first field changes.
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const editingProduct = products.find((p) => p.id === editingProductId) ?? null;

  const rows = useMemo(() => buildPricingRows(products, entries, costCtx), [products, entries, costCtx]);

  return (
    <div>
      <PageHeader icon={Calculator} title="Pricing" />

      {viewMode === "advanced" ? (
        <div className="space-y-6">
          <IngredientCostsPanel />

          {/* One sortable table instead of three tall stacked cards: "which product should
              I push" is a comparison, and a comparison you have to scroll through isn't one. */}
          <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-border bg-card">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium" style={{ minWidth: 180 }}>Product</th>
                  <th className="px-3 py-2 text-right font-medium" style={{ minWidth: 100 }}>Cost/jar</th>
                  <th className="px-3 py-2 text-right font-medium" style={{ minWidth: 110 }}>Calculated</th>
                  <th className="px-3 py-2 text-right font-medium" style={{ minWidth: 130 }}>Actually selling at</th>
                  <th className="px-3 py-2 text-right font-medium" style={{ minWidth: 90 }}>Margin</th>
                  <th className="px-3 py-2 text-right font-medium" style={{ minWidth: 110 }}>Profit/jar</th>
                  <th className="w-0 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const open = expandedId === row.productId;
                  const product = products.find((p) => p.id === row.productId);
                  return (
                    <Fragment key={row.productId}>
                      <tr
                        className="cursor-pointer border-b border-border last:border-0 hover:bg-accent"
                        onClick={() => setExpandedId(open ? null : row.productId)}
                      >
                        <td className="px-3 py-2.5 font-medium text-foreground">{row.productName}</td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">{formatPeso(row.costPerJar)}</td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">
                          {formatPeso(row.calculatedPrice)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {row.actualPrice == null ? (
                            <span className="text-muted-foreground">no sales</span>
                          ) : (
                            <span className="font-medium text-foreground">
                              {formatPeso(row.actualPrice)}
                              <span className="block text-[12px] font-normal text-muted-foreground">
                                {pluralize(row.actualSales, "sale")}, {PRICING_WINDOW_DAYS}d
                              </span>
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right font-medium",
                            row.marginPct < 0 ? "text-[var(--status-critical)]" : "text-foreground",
                          )}
                        >
                          {Math.round(row.marginPct)}%
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right font-semibold",
                            row.profitPerJar < 0 ? "text-[var(--status-critical)]" : "text-[var(--status-good)]",
                          )}
                        >
                          {formatPeso(row.profitPerJar)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                      </tr>
                      {open && product && (
                        <tr>
                          <td colSpan={7} className="bg-secondary/40 px-3 py-4">
                            {row.gap != null && Math.abs(row.gap) >= 1 && (
                              <p className="mb-3 text-[13px] text-muted-foreground">
                                You&apos;re pricing{" "}
                                <span className="font-medium text-foreground">
                                  {formatPeso(Math.abs(row.gap))} {row.gap > 0 ? "above" : "below"}
                                </span>{" "}
                                your formula.
                              </p>
                            )}
                            <PricingCalculatorCard product={product} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <BigRowList
          rows={products}
          keyFor={(p) => p.id}
          icon={Calculator}
          iconTone="good"
          title={(p) => p.name}
          subtitle={(p) => PRICING_MODE_LABELS[p.pricingMode] ?? p.pricingMode}
          trailing={(p) => formatPeso(effectiveProductPrice(p, productCostPerJar(p, costCtx)))}
          trailingTone={(p) => {
            const cost = productCostPerJar(p, costCtx);
            return effectiveProductPrice(p, cost) - cost.costPerJar < 0 ? "warning" : "good";
          }}
          onSelect={(p) => setEditingProductId(p.id)}
          emptyMessage="No products yet."
        />
      )}

      {editingProduct && <SimplePricingDialog product={editingProduct} onClose={() => setEditingProductId(null)} />}
    </div>
  );
}
