"use client";

import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatPeso, PRICING_MODE_LABELS } from "@/lib/format";
import { updateProduct } from "@/lib/store/store";
import { useStore } from "@/lib/store/use-store";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import type { PricingMode, Product } from "@/lib/store/types";
import { cn } from "@/lib/utils";

/** The Simple-view equivalent of PricingCalculatorCard — just the pricing
 * metric and its one relevant input, no recipe/ingredient editing (that stays
 * an Advanced-view-only concern, same as everywhere else in the app). */
export function SimplePricingDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const { rawMaterials } = useStore();
  const cost = productCostPerJar(product, rawMaterials);
  const effectivePrice = effectiveProductPrice(product, cost);
  const profit = effectivePrice - cost.costPerJar;
  const belowCost = profit < 0;

  const marginField = useNumericDraft(product.marginPercent, (n) => updateProduct(product.id, { marginPercent: n }));
  const standardPriceField = useNumericDraft(product.standardPrice, (n) => updateProduct(product.id, { standardPrice: n }));
  const marketPriceField = useNumericDraft(product.marketPrice, (n) => updateProduct(product.id, { marketPrice: n }));

  function handleModeChange(nextMode: PricingMode) {
    if (product.pricingMode === "cost_percent" && nextMode === "manual") {
      updateProduct(product.id, { pricingMode: "manual", standardPrice: Math.round(effectivePrice * 100) / 100 });
      return;
    }
    if (nextMode === "competitive" && product.marketPrice === 0) {
      updateProduct(product.id, { pricingMode: "competitive", marketPrice: Math.round(effectivePrice * 100) / 100 });
      return;
    }
    updateProduct(product.id, { pricingMode: nextMode });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">How should this price be set?</Label>
            <select
              value={product.pricingMode}
              onChange={(e) => handleModeChange(e.target.value as PricingMode)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="manual">{PRICING_MODE_LABELS.manual} — I&apos;ll set it myself</option>
              <option value="cost_percent">{PRICING_MODE_LABELS.cost_percent} — cost + margin %</option>
              <option value="competitive">{PRICING_MODE_LABELS.competitive} — match similar products</option>
            </select>
          </div>

          {product.pricingMode === "cost_percent" ? (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Margin</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  value={marginField.value}
                  onChange={(e) => marginField.onChange(e.target.value)}
                  className="h-9 w-20"
                />
                <span className="text-sm text-muted-foreground">% over cost</span>
              </div>
            </div>
          ) : product.pricingMode === "competitive" ? (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">What similar products sell for</Label>
              <Input
                type="number"
                value={marketPriceField.value}
                onChange={(e) => marketPriceField.onChange(e.target.value)}
                className="h-9 text-lg font-semibold"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Selling price</Label>
              <Input
                type="number"
                value={standardPriceField.value}
                onChange={(e) => standardPriceField.onChange(e.target.value)}
                className="h-9 text-lg font-semibold"
              />
            </div>
          )}

          <div className="rounded-xl border border-border p-3 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Price</span>
              <span className="font-semibold text-foreground">{formatPeso(effectivePrice)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Cost per jar</span>
              <span className="font-semibold text-foreground">{formatPeso(cost.costPerJar)}</span>
            </div>
            <p className={cn("mt-1.5 flex items-center gap-1.5 font-medium", belowCost ? "text-[var(--status-warning)]" : "text-[var(--status-good)]")}>
              {belowCost && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
              {belowCost ? `Losing ${formatPeso(Math.abs(profit))} per jar` : `Making ${formatPeso(profit)} profit per jar`}
            </p>
          </div>

          <Button size="sm" variant="ghost" className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
