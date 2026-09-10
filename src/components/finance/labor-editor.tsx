"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  laborPerBatch,
}: {
  product: Product;
  hourlyRate: number;
  laborPerBatch: number;
}) {
  const isOverride = product.laborCostOverride != null;
  const minutesField = useNumericDraft(product.minutesPerBatch ?? 0, (n) =>
    updateProduct(product.id, { minutesPerBatch: n }),
  );
  const overrideField = useNumericDraft(product.laborCostOverride ?? 0, (n) =>
    updateProduct(product.id, { laborCostOverride: n }),
  );
  const derived = ((product.minutesPerBatch ?? 0) / 60) * hourlyRate;

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-muted-foreground">Labor per batch</Label>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Minutes a batch takes</Label>
          <Input
            type="number"
            inputMode="decimal"
            className="h-8 w-24"
            value={minutesField.value}
            onChange={(e) => minutesField.onChange(e.target.value)}
          />
        </div>
        <p className="pb-1.5 text-xs text-muted-foreground">
          × {formatPeso(hourlyRate)}/hr = <span className="font-medium text-foreground">{formatPeso(derived)}</span>
        </p>
      </div>

      {isOverride ? (
        <div className="space-y-1.5 rounded-xl border border-border p-2.5">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Entered by hand</Label>
              <Input
                type="number"
                inputMode="decimal"
                className="h-8 w-24"
                value={overrideField.value}
                onChange={(e) => overrideField.onChange(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-8"
              onClick={() => updateProduct(product.id, { laborCostOverride: null })}
            >
              Recalculate from time
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This figure is being used instead of the timed one. Costing this batch at{" "}
            {formatPeso(laborPerBatch)}.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Costed from time. {hourlyRate <= 0 && "Set an hourly rate in Settings for this to count for anything."}
        </p>
      )}
    </div>
  );
}
