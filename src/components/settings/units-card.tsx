"use client";

import { Ruler } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnitSelect } from "@/components/ui/unit-select";
import { useStore } from "@/lib/store/use-store";
import { updateProduct, updateRawMaterial } from "@/lib/store/store";
import { productUnit } from "@/lib/units";

/**
 * The unit each item is counted in, all in one place.
 *
 * It can also be set on the product itself, but nobody opens six product dialogs to fix six
 * units — and a unit that's wrong is the thing that turns a 250ml sale into "1 unit". Raw
 * materials sit in the same list because a recipe's kilos and a supplier's price only line
 * up when both agree on what a unit is.
 */
export function UnitsCard() {
  const { products, rawMaterials } = useStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ruler className="h-4 w-4" /> Units
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          What one of each item is called when you enter a quantity. Set it once here and every sale, expense and
          stock count fills it in for you.
        </p>

        {products.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground">What you sell</h3>
            <ul className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
              {products.map((product) => (
                <li key={product.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{product.name}</span>
                  <UnitSelect
                    className="h-9 w-28"
                    allowEmpty={false}
                    value={productUnit(product)}
                    onChange={(unit) => updateProduct(product.id, { unit: unit ?? "jars" })}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {rawMaterials.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground">What you buy</h3>
            <ul className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
              {rawMaterials.map((material) => (
                <li key={material.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{material.name}</span>
                  <UnitSelect
                    className="h-9 w-28"
                    allowEmpty={false}
                    value={material.unit || "kg"}
                    onChange={(unit) => updateRawMaterial(material.id, { unit: unit ?? "kg" })}
                  />
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Changing one of these doesn&apos;t convert what&apos;s already counted — if 5 kg becomes 5 g, say so in
              your stock count too.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
