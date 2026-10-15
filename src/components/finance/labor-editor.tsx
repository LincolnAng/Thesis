"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPeso } from "@/lib/format";
import { setBusinessSetting, updateProduct } from "@/lib/store/store";
import { HOURLY_LABOR_RATE_KEY } from "@/lib/summary/use-cost-context";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import type { Product } from "@/lib/store/types";

/**
 * Labor for one batch, either timed or typed.
 *
 * Existing per-batch labor costs were migrated into `laborCostOverride`, so nobody's numbers
 * changed underneath them when costing moved to minutes × rate. An override wins and says so;
 * clearing it hands the product back to the derived figure.
 *
 * The hourly rate is typed right here, next to the minutes it multiplies. It is still one rate
 * for the whole business — changing it on one product reprices every product costed by time.
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
  const rateField = useNumericDraft(hourlyRate, (n) => setBusinessSetting(HOURLY_LABOR_RATE_KEY, String(n)));
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
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input
          type="number"
          inputMode="decimal"
          aria-label="Minutes a batch takes"
          className="h-10 w-20 text-right"
          value={minutesField.value}
          onChange={(e) => minutesField.onChange(e.target.value)}
        />
        <span className="text-muted-foreground">minutes at ₱</span>
        <Input
          type="number"
          inputMode="decimal"
          aria-label="Hourly labor rate"
          className="h-10 w-20 text-right"
          value={rateField.value}
          onChange={(e) => rateField.onChange(e.target.value)}
        />
        <span className="text-muted-foreground">
          an hour = <span className="font-semibold text-foreground">{formatPeso(derived)}</span>
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-10 text-xs font-semibold text-cacao"
          onClick={() => updateProduct(product.id, { laborCostOverride: derived })}
        >
          Type a cost instead
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {hourlyRate <= 0 ? "Set what an hour of work is worth — until then your time counts as ₱0. " : ""}
        The hourly rate is the same for every product; changing it here updates them all.
      </p>
    </div>
  );
}
