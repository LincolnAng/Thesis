"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChipGroup } from "@/components/ui/chip-group";
import { formatPeso, PRICING_MODE_LABELS } from "@/lib/format";
import { updateProduct } from "@/lib/store/store";
import { MAX_MARGIN_PCT, PRICING_METHODS, pricingModeChange } from "@/lib/summary/pricing-methods";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import type { PricingMode, Product } from "@/lib/store/types";

/**
 * Picks how a product's price is set — self, cost-based, margin-based, or market-based —
 * and shows the one input that method needs. Shared by the Advanced pricing card and the
 * Simple pricing dialog so the two can't drift apart.
 */
export function PricingMethodPicker({
  product,
  costPerJar,
  effectivePrice,
}: {
  product: Product;
  costPerJar: number;
  effectivePrice: number;
}) {
  const method = PRICING_METHODS.find((m) => m.mode === product.pricingMode) ?? PRICING_METHODS[0];

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-muted-foreground">Pricing method</Label>
      <ChipGroup
        options={PRICING_METHODS.map((m) => m.mode)}
        value={product.pricingMode}
        labels={PRICING_MODE_LABELS}
        onChange={(next: PricingMode) => updateProduct(product.id, pricingModeChange(product, next, effectivePrice))}
      />
      <p className="text-xs text-muted-foreground">{method.hint}</p>
      {/* Keyed on the method so its input re-seeds when switching converts the % value. */}
      <MethodInput key={product.pricingMode} product={product} costPerJar={costPerJar} effectivePrice={effectivePrice} />
    </div>
  );
}

function MethodInput({
  product,
  costPerJar,
  effectivePrice,
}: {
  product: Product;
  costPerJar: number;
  effectivePrice: number;
}) {
  const pct = useNumericDraft(product.marginPercent, (n) => updateProduct(product.id, { marginPercent: n }));
  const selfPrice = useNumericDraft(product.standardPrice, (n) => updateProduct(product.id, { standardPrice: n }));
  const marketPrice = useNumericDraft(product.marketPrice, (n) => updateProduct(product.id, { marketPrice: n }));
  const profit = effectivePrice - costPerJar;

  if (product.pricingMode === "cost_percent" || product.pricingMode === "margin") {
    const isMargin = product.pricingMode === "margin";
    const capped = isMargin && product.marginPercent > MAX_MARGIN_PCT;
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={pct.value}
            aria-invalid={capped}
            onChange={(e) => pct.onChange(e.target.value)}
            className="h-9 w-20"
          />
          <span className="text-sm text-muted-foreground">{isMargin ? "% of the price is profit" : "% markup on cost"}</span>
        </div>
        <p className="text-lg font-semibold text-foreground">{formatPeso(effectivePrice)}</p>
        <p className="text-xs text-muted-foreground">
          {isMargin
            ? `${formatPeso(costPerJar)} cost ÷ (1 − ${Math.min(product.marginPercent, MAX_MARGIN_PCT)}%) — ${formatPeso(profit)} profit per jar`
            : `${formatPeso(costPerJar)} cost + ${product.marginPercent}% — ${formatPeso(profit)} profit per jar`}
        </p>
        {capped && <p className="text-xs text-destructive">A margin can&apos;t reach 100% — using {MAX_MARGIN_PCT}%.</p>}
      </div>
    );
  }

  const field = product.pricingMode === "competitive" ? marketPrice : selfPrice;
  return (
    <div className="space-y-1">
      <div className="flex max-w-xs items-center gap-2">
        <span className="text-sm text-muted-foreground">₱</span>
        <Input
          type="number"
          value={field.value}
          onChange={(e) => field.onChange(e.target.value)}
          className="h-9 text-lg font-semibold"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {product.pricingMode === "competitive" ? "What similar products sell for · " : ""}
        {costPerJar > 0 && `${(effectivePrice > 0 ? (profit / effectivePrice) * 100 : 0).toFixed(0)}% margin at ${formatPeso(costPerJar)} cost`}
      </p>
    </div>
  );
}
