"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPeso } from "@/lib/format";
import { updateProduct } from "@/lib/store/store";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import type { Product } from "@/lib/store/types";

/**
 * Labor for one batch, either timed or typed.
 *
 * Existing per-batch labor costs were migrated into `laborCostOverride`, so nobody's numbers
 * changed underneath them when costing moved to minutes × rate. An override wins and says so;
 * clearing it hands the product back to the derived figure.
 */
export function LaborEditor({
  product,
  hourlyRate,
}: {
  product: Product;
  hourlyRate: number;
}) {
  const isOverride = product.laborCostOverride != null;
  const minutesField = useNumericDraft(product.minutesPerBatch ?? 0, (n) =>
    updateProduct(product.id, { minutesPerBatch: n }),
  );
  const overrideField = useNumericDraft(product.laborCostOverride ?? 0, (n) =>
    updateProduct(product.id, { laborCostOverride: n }),
  );
  const derived = ((product.minutesPerBatch ?? 0) / 60) * hourlyRate;

  // One line either way: minutes × rate = cost, or the hand-entered figure that replaces it.
  return isOverride ? (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Entered by hand</span>
      <Input
        type="number"
        inputMode="decimal"
        aria-label="Labor per batch, entered by hand"
        className="h-11 w-24 text-right"
        value={overrideField.value}
        onChange={(e) => overrideField.onChange(e.target.value)}
      />
      <span className="text-muted-foreground">a batch</span>
      <Button
        size="sm"
        variant="ghost"
        className="min-h-11 text-xs font-semibold text-cacao"
        onClick={() => updateProduct(product.id, { laborCostOverride: null })}
      >
        Work it out from time instead
      </Button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Input
        type="number"
        inputMode="decimal"
        aria-label="Minutes a batch takes"
        className="h-11 w-20 text-right"
        value={minutesField.value}
        onChange={(e) => minutesField.onChange(e.target.value)}
      />
      <span className="text-muted-foreground">
        minutes × {formatPeso(hourlyRate)}/hr = <span className="font-semibold text-foreground">{formatPeso(derived)}</span>
      </span>
      {hourlyRate <= 0 && <span className="text-xs text-[#9A6B12]">Set an hourly rate in Settings for this to count.</span>}
    </div>
  );
}
