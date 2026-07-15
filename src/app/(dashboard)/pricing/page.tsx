"use client";

import { BackToSummaryLink } from "@/components/summary/back-to-summary-link";
import { PricingCalculatorCard } from "@/components/finance/pricing-calculator-card";
import { IngredientCostsPanel } from "@/components/finance/ingredient-costs-panel";
import { useStore } from "@/lib/store/use-store";

export default function PricingPage() {
  const { products } = useStore();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-4">
        <BackToSummaryLink />
      </div>
      <h1 className="mb-1 text-xl font-bold text-foreground">Pricing calculator</h1>
      <p className="mb-4 text-sm text-muted-foreground">See how much profit each jar makes.</p>

      <div className="mb-4">
        <IngredientCostsPanel />
      </div>

      <div className="space-y-4">
        {products.map((product) => (
          <PricingCalculatorCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
