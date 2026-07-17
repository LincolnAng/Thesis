"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { PricingCalculatorCard } from "@/components/finance/pricing-calculator-card";
import { SimplePricingDialog } from "@/components/finance/simple-pricing-dialog";
import { IngredientCostsPanel } from "@/components/finance/ingredient-costs-panel";
import { BigRowList } from "@/components/data-table/big-row-list";
import { formatPeso, PRICING_MODE_LABELS } from "@/lib/format";
import { useStore } from "@/lib/store/use-store";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { useViewMode } from "@/lib/summary/view-mode";

export default function PricingPage() {
  const { products, rawMaterials } = useStore();
  const [viewMode] = useViewMode();
  // Tracked by id, not the Product object itself — the dialog saves each field
  // instantly as it's edited (no explicit Save step), so it must keep reading
  // the live product from the store rather than a snapshot that goes stale the
  // moment the first field changes.
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const editingProduct = products.find((p) => p.id === editingProductId) ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold text-foreground">Pricing calculator</h1>
      <p className="mb-4 text-sm text-muted-foreground">See how much profit each jar makes.</p>

      {viewMode === "advanced" ? (
        <>
          <div className="mb-4">
            <IngredientCostsPanel />
          </div>

          <div className="space-y-4">
            {products.map((product) => (
              <PricingCalculatorCard key={product.id} product={product} />
            ))}
          </div>
        </>
      ) : (
        <BigRowList
          rows={products}
          keyFor={(p) => p.id}
          icon={Calculator}
          iconTone="good"
          title={(p) => p.name}
          subtitle={(p) => PRICING_MODE_LABELS[p.pricingMode] ?? p.pricingMode}
          trailing={(p) => formatPeso(effectiveProductPrice(p, productCostPerJar(p, rawMaterials)))}
          trailingTone={(p) => {
            const cost = productCostPerJar(p, rawMaterials);
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
