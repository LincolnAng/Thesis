"use client";

import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import { setBusinessSetting } from "@/lib/store/store";
import { useStore } from "@/lib/store/use-store";
import { formatPeso } from "@/lib/format";
import { HOURLY_LABOR_RATE_KEY, hourlyLaborRateFrom } from "@/lib/summary/use-cost-context";

/**
 * The hourly rate labor is costed at. One number for the whole business — changing it
 * reprices every product that derives its labor from time, in one go.
 */
export function LaborRateCard() {
  const { businessSettings, products } = useStore();
  const rate = hourlyLaborRateFrom(businessSettings);
  const rateField = useNumericDraft(rate, (n) => setBusinessSetting(HOURLY_LABOR_RATE_KEY, String(n)));

  const derivingProducts = products.filter((p) => p.laborCostOverride == null).length;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" /> Labor rate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          What an hour of making costs. Products that record the minutes a batch takes use this to work out their
          labor cost, so raising the rate reprices them all at once.
        </p>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Per hour</Label>
          <Input
            type="number"
            inputMode="decimal"
            className="h-9 w-32"
            value={rateField.value}
            onChange={(e) => rateField.onChange(e.target.value)}
          />
        </div>
        {rate <= 0 ? (
          <p className="text-sm text-[var(--status-warning)]">
            Not set yet, so labor counts as ₱0 for any product without a hand-entered figure — margins will look
            better than they are.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {formatPeso(rate)} an hour
            {derivingProducts > 0
              ? ` · used by ${derivingProducts} of ${products.length} products`
              : " · every product currently uses a hand-entered labor cost instead"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
