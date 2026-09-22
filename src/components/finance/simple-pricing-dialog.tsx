"use client";

import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/format";
import { PricingMethodPicker } from "@/components/finance/pricing-method-picker";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import type { Product } from "@/lib/store/types";
import { cn } from "@/lib/utils";

/** The Simple-view equivalent of PricingCalculatorCard — just the pricing
 * metric and its one relevant input, no recipe/ingredient editing (that stays
 * an Advanced-view-only concern, same as everywhere else in the app). */
export function SimplePricingDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const costCtx = useCostContext();
  const cost = productCostPerJar(product, costCtx);
  const effectivePrice = effectiveProductPrice(product, cost);
  const profit = effectivePrice - cost.costPerJar;
  const belowCost = profit < 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <PricingMethodPicker product={product} costPerJar={cost.costPerJar} effectivePrice={effectivePrice} />

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
