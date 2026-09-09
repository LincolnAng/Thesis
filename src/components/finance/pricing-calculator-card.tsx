"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Minus, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/format";
import { updateProduct } from "@/lib/store/store";
import { useStore } from "@/lib/store/use-store";
import { effectiveProductPrice, ingredientRowCost, productCostPerJar } from "@/lib/summary/recipe-cost";
import { CostBreakdownChart } from "@/components/finance/cost-breakdown-chart";
import { useViewMode } from "@/lib/summary/view-mode";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import type { PricingMode, Product, RawMaterialStock, RecipeExtraRow, RecipeIngredientRow } from "@/lib/store/types";
import { cn } from "@/lib/utils";

function genRowId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function ExtraRow({
  row,
  onChange,
  onRemove,
}: {
  row: RecipeExtraRow;
  onChange: (id: string, patch: Partial<RecipeExtraRow>) => void;
  onRemove: (id: string) => void;
}) {
  const costField = useNumericDraft(row.cost, (n) => onChange(row.id, { cost: n }));
  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="What for?"
        value={row.label}
        onChange={(e) => onChange(row.id, { label: e.target.value })}
        className="h-8 flex-1 text-sm"
      />
      <Input
        type="number"
        placeholder="₱"
        value={costField.value}
        onChange={(e) => costField.onChange(e.target.value)}
        className="h-8 w-24 text-sm"
      />
      <Button size="icon-sm" variant="ghost" className="text-muted-foreground" onClick={() => onRemove(row.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ExtraRowsSection({
  title,
  subtitle,
  rows,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  subtitle?: string;
  rows: RecipeExtraRow[];
  onAdd: () => void;
  onChange: (id: string, patch: Partial<RecipeExtraRow>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">{title}</Label>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <ExtraRow key={row.id} row={row} onChange={onChange} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

function IngredientRowEditor({
  row,
  material,
  rawMaterials,
  onUpdate,
  onRemove,
}: {
  row: RecipeIngredientRow;
  material: RawMaterialStock | undefined;
  rawMaterials: RawMaterialStock[];
  onUpdate: (id: string, patch: Partial<RecipeIngredientRow>) => void;
  onRemove: (id: string) => void;
}) {
  const qtyField = useNumericDraft(row.quantity, (n) => onUpdate(row.id, { quantity: n }));
  return (
    <div className="space-y-1.5 rounded-xl border border-border p-2.5">
      <div className="flex items-center gap-2">
        <select
          value={row.materialId}
          onChange={(e) => onUpdate(row.id, { materialId: e.target.value })}
          className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {rawMaterials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <Button size="icon-sm" variant="ghost" className="text-muted-foreground" onClick={() => onRemove(row.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={qtyField.value}
          onChange={(e) => qtyField.onChange(e.target.value)}
          className="h-8 flex-1 text-sm"
        />
        <span className="w-10 shrink-0 text-xs text-muted-foreground">{material?.unit ?? ""}</span>
        <span className="w-20 shrink-0 text-right text-xs font-medium text-foreground">
          {formatPeso(ingredientRowCost(row, rawMaterials))}
        </span>
      </div>
    </div>
  );
}

function TierRow({
  tier,
}: {
  tier: { label: string; price: number; onChange: (n: number) => void; profit: number; belowCost: boolean };
}) {
  const field = useNumericDraft(tier.price, tier.onChange);
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        {tier.label}
        <Input type="number" value={field.value} onChange={(e) => field.onChange(e.target.value)} className="h-7 w-20 text-xs" />
      </span>
      <span
        className={cn(
          "flex items-center gap-1 font-medium",
          tier.belowCost ? "text-[var(--status-warning)]" : "text-[var(--status-good)]",
        )}
      >
        {tier.belowCost && <AlertTriangle className="h-3.5 w-3.5" />}
        {tier.belowCost ? "Losing money" : `${formatPeso(tier.profit)} profit`}
      </span>
    </div>
  );
}

export function PricingCalculatorCard({ product }: { product: Product }) {
  const { rawMaterials } = useStore();
  const [showMore, setShowMore] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [viewMode] = useViewMode();

  const ingredients = product.recipeIngredients;
  const labor = product.recipeLabor;
  const misc = product.recipeMisc;

  const cost = productCostPerJar(product, rawMaterials);
  const totalForRun = cost.batchTotal * batchCount;
  const jarsForRun = product.batchYield * batchCount;

  const effectivePrice = effectiveProductPrice(product, cost);

  const standardProfit = effectivePrice - cost.costPerJar;
  const standardBelowCost = standardProfit < 0;

  const marginField = useNumericDraft(product.marginPercent, (n) => updateProduct(product.id, { marginPercent: n }));
  const standardPriceField = useNumericDraft(product.standardPrice, (n) => updateProduct(product.id, { standardPrice: n }));
  const marketPriceField = useNumericDraft(product.marketPrice, (n) => updateProduct(product.id, { marketPrice: n }));
  const yieldField = useNumericDraft(product.batchYield, (n) => persist(ingredients, labor, misc, n));

  function handleModeChange(nextMode: PricingMode) {
    if (product.pricingMode === "cost_percent" && nextMode === "manual") {
      // Snapshot the live cost-based price so switching back to manual doesn't revert to a stale number.
      updateProduct(product.id, { pricingMode: "manual", standardPrice: Math.round(effectivePrice * 100) / 100 });
      return;
    }
    if (nextMode === "competitive" && product.marketPrice === 0) {
      // Seed the market-price field from whatever's currently effective, so switching
      // to this mode never abruptly shows ₱0 before the owner has entered anything.
      updateProduct(product.id, { pricingMode: "competitive", marketPrice: Math.round(effectivePrice * 100) / 100 });
      return;
    }
    updateProduct(product.id, { pricingMode: nextMode });
  }

  const otherTiers = [
    { label: "Friend rate", price: product.friendPrice, onChange: (n: number) => updateProduct(product.id, { friendPrice: n }) },
    { label: "Wholesale", price: product.wholesalePrice, onChange: (n: number) => updateProduct(product.id, { wholesalePrice: n }) },
  ].map((tier) => {
    const profit = tier.price - cost.costPerJar;
    return { ...tier, profit, belowCost: profit < 0 };
  });

  const shortages = ingredients
    .map((row) => {
      const material = rawMaterials.find((m) => m.id === row.materialId);
      if (!material) return null;
      const needed = Math.round(row.quantity * batchCount * 100) / 100;
      const short = Math.round((needed - material.qty) * 100) / 100;
      return short > 0 ? { material, needed, short } : null;
    })
    .filter((x): x is { material: (typeof rawMaterials)[number]; needed: number; short: number } => x !== null);

  function persist(
    nextIngredients: RecipeIngredientRow[],
    nextLabor: RecipeExtraRow[],
    nextMisc: RecipeExtraRow[],
    nextYield: number,
  ) {
    updateProduct(product.id, {
      recipeIngredients: nextIngredients,
      recipeLabor: nextLabor,
      recipeMisc: nextMisc,
      batchYield: nextYield,
    });
  }

  function addIngredient() {
    if (rawMaterials.length === 0) return;
    persist(
      [...ingredients, { id: genRowId("ing"), materialId: rawMaterials[0].id, quantity: 0 }],
      labor,
      misc,
      product.batchYield,
    );
  }
  function updateIngredient(id: string, patch: Partial<RecipeIngredientRow>) {
    persist(
      ingredients.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      labor,
      misc,
      product.batchYield,
    );
  }
  function removeIngredient(id: string) {
    persist(
      ingredients.filter((r) => r.id !== id),
      labor,
      misc,
      product.batchYield,
    );
  }

  function addLabor() {
    persist(ingredients, [...labor, { id: genRowId("lab"), label: "", cost: 0 }], misc, product.batchYield);
  }
  function updateLabor(id: string, patch: Partial<RecipeExtraRow>) {
    persist(
      ingredients,
      labor.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      misc,
      product.batchYield,
    );
  }
  function removeLabor(id: string) {
    persist(
      ingredients,
      labor.filter((r) => r.id !== id),
      misc,
      product.batchYield,
    );
  }

  function addMisc() {
    persist(ingredients, labor, [...misc, { id: genRowId("misc"), label: "", cost: 0 }], product.batchYield);
  }
  function updateMisc(id: string, patch: Partial<RecipeExtraRow>) {
    persist(
      ingredients,
      labor,
      misc.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      product.batchYield,
    );
  }
  function removeMisc(id: string) {
    persist(
      ingredients,
      labor,
      misc.filter((r) => r.id !== id),
      product.batchYield,
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{product.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Selling price</Label>
            <select
              value={product.pricingMode}
              onChange={(e) => handleModeChange(e.target.value as PricingMode)}
              className="h-7 w-full rounded-md border border-input bg-transparent px-1.5 text-xs text-muted-foreground"
            >
              <option value="manual">I&apos;ll set it myself</option>
              <option value="cost_percent">Cost + margin %</option>
              <option value="competitive">Match the market</option>
              <option value="suggested" disabled>
                Suggested for me — coming soon
              </option>
            </select>
            {product.pricingMode === "cost_percent" ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    value={marginField.value}
                    onChange={(e) => marginField.onChange(e.target.value)}
                    className="h-8 w-16 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">% margin</span>
                </div>
                <p className="text-lg font-semibold text-foreground">{formatPeso(effectivePrice)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatPeso(cost.costPerJar)} cost + {product.marginPercent}% margin
                </p>
              </div>
            ) : product.pricingMode === "competitive" ? (
              <div className="space-y-1">
                <Input
                  type="number"
                  value={marketPriceField.value}
                  onChange={(e) => marketPriceField.onChange(e.target.value)}
                  className="h-9 text-lg font-semibold"
                />
                <p className="text-xs text-muted-foreground">what similar products sell for</p>
              </div>
            ) : (
              <Input
                type="number"
                value={standardPriceField.value}
                onChange={(e) => standardPriceField.onChange(e.target.value)}
                className="h-9 text-lg font-semibold"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Total cost</Label>
            <p className="text-lg font-semibold text-foreground">
              {formatPeso(cost.costPerJar)} <span className="text-xs font-normal text-muted-foreground">/jar</span>
            </p>
          </div>
        </div>

        <p
          className={cn(
            "text-sm font-medium",
            standardBelowCost ? "text-[var(--status-warning)]" : "text-[var(--status-good)]",
          )}
        >
          {standardBelowCost
            ? `You lose ${formatPeso(Math.abs(standardProfit))} on every jar you sell at the regular price.`
            : `You make ${formatPeso(standardProfit)} profit on every jar you sell at the regular price.`}
        </p>

        <Button size="sm" variant="ghost" className="w-full gap-1 text-xs text-muted-foreground" onClick={() => setShowMore((v) => !v)}>
          {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showMore ? "Show less" : "See more"}
        </Button>

        {showMore && (
          <div className="space-y-5 border-t border-border pt-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Other prices</Label>
              <div className="space-y-1.5">
                {otherTiers.map((tier) => (
                  <TierRow key={tier.label} tier={tier} />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">What this jar costs to make</Label>
                <p className="text-xs text-muted-foreground">
                  Ingredients, labor, and other costs add up to {formatPeso(cost.costPerJar)} per jar.
                </p>
              </div>

              {viewMode === "advanced" && <CostBreakdownChart cost={cost} />}

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Ingredients in a batch</span>
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={addIngredient} disabled={rawMaterials.length === 0}>
                  <Plus className="h-3.5 w-3.5" /> Add ingredient
                </Button>
              </div>

              {rawMaterials.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No ingredients tracked yet — add one in Ingredient costs above first.
                </p>
              ) : ingredients.length === 0 ? (
                <p className="text-xs text-muted-foreground">No ingredients yet. Tap &quot;Add ingredient&quot; to get started.</p>
              ) : (
                <div className="space-y-2">
                  {ingredients.map((row) => (
                    <IngredientRowEditor
                      key={row.id}
                      row={row}
                      material={rawMaterials.find((m) => m.id === row.materialId)}
                      rawMaterials={rawMaterials}
                      onUpdate={updateIngredient}
                      onRemove={removeIngredient}
                    />
                  ))}
                </div>
              )}

              <ExtraRowsSection title="Labor per batch" rows={labor} onAdd={addLabor} onChange={updateLabor} onRemove={removeLabor} />
              <ExtraRowsSection
                title="Other costs per batch"
                subtitle="Electricity, gas, misc."
                rows={misc}
                onAdd={addMisc}
                onChange={updateMisc}
                onRemove={removeMisc}
              />

              <div className="space-y-1.5">
                <Label className="text-xs">Jars per batch</Label>
                <Input
                  type="number"
                  value={yieldField.value}
                  onChange={(e) => yieldField.onChange(e.target.value)}
                  className="h-8 w-28"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border p-3">
              <Label className="text-xs font-semibold text-muted-foreground">Making more than one batch?</Label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Fewer batches"
                    onClick={() => setBatchCount((n) => Math.max(1, n - 1))}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold text-foreground">{batchCount}</span>
                  <Button size="icon-sm" variant="outline" aria-label="More batches" onClick={() => setBatchCount((n) => n + 1)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <span className="text-sm text-muted-foreground">batch{batchCount === 1 ? "" : "es"}</span>
              </div>
              <p className="text-sm text-foreground">
                Needs <span className="font-semibold">{formatPeso(totalForRun)}</span> total · makes{" "}
                <span className="font-semibold">{jarsForRun}</span> jars
              </p>
              <p className="text-xs text-muted-foreground">
                Cost per jar stays {formatPeso(cost.costPerJar)} no matter how many batches you make.
              </p>
              {shortages.length > 0 && (
                <div className="space-y-1 rounded-lg border border-[var(--status-warning)] bg-amber-50 p-2 dark:bg-amber-950/30">
                  {shortages.map(({ material, needed, short }) => (
                    <p key={material.id} className="flex items-start gap-1.5 text-xs text-[var(--status-warning)]">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      Not enough {material.name} — have {material.qty} {material.unit}, need {needed} {material.unit} ({short}{" "}
                      {material.unit} short)
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
