"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Minus, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/format";
import { updateProduct } from "@/lib/store/store";
import { useStore } from "@/lib/store/use-store";
import { ingredientRowCost, productCostPerJar } from "@/lib/summary/recipe-cost";
import { CostBreakdownChart } from "@/components/finance/cost-breakdown-chart";
import { CostBreakdownLines } from "@/components/finance/cost-breakdown-lines";
import { LaborEditor } from "@/components/finance/labor-editor";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import type { Product, RawMaterialStock, RecipeComponentRow, RecipeExtraRow, RecipeIngredientRow } from "@/lib/store/types";

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
        className="h-11 min-w-0 flex-1 text-sm"
      />
      <Input
        type="number"
        inputMode="decimal"
        placeholder="₱ per batch"
        aria-label="Cost per batch"
        value={costField.value}
        onChange={(e) => costField.onChange(e.target.value)}
        className="h-11 w-28 shrink-0 text-right text-sm"
      />
      <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label="Remove" onClick={() => onRemove(row.id)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * One of the three things a batch costs — Recipe, Labor, Fixed costs — as its own block with
 * its own heading, so labor and fixed costs don't read as lines of the recipe above them.
 * The heading line carries the block's total and its one action.
 */
export function CostSection({
  title,
  total,
  hint,
  action,
  children,
}: {
  title: string;
  total?: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line/15 bg-card p-3.5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[16px] font-semibold">
          {title}
          {total && <span className="ml-2 font-sans text-[13px] font-semibold text-muted-foreground">{total}</span>}
        </h3>
        {action}
      </div>
      {hint && <p className="-mt-1.5 mb-2.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function AddButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button size="sm" variant="ghost" className="min-h-11 gap-1 px-2 text-xs font-semibold text-cacao" onClick={onClick} disabled={disabled}>
      <Plus className="h-3.5 w-3.5" /> {children}
    </Button>
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
  const costCtx = useCostContext();
  return (
    // One line per ingredient: what, how much, in what, what it costs. Splitting the name and
    // the quantity over two lines made a five-ingredient recipe read like ten loose fields.
    <div className="flex items-center gap-2">
      <select
        value={row.materialId}
        onChange={(e) => onUpdate(row.id, { materialId: e.target.value })}
        aria-label="Ingredient"
        className="h-11 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {rawMaterials.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <Input
        type="number"
        inputMode="decimal"
        aria-label="Quantity"
        value={qtyField.value}
        onChange={(e) => qtyField.onChange(e.target.value)}
        className="h-11 w-20 shrink-0 text-right text-sm"
      />
      <span className="w-10 shrink-0 text-xs text-muted-foreground">{material?.unit ?? ""}</span>
      <span className="hidden w-20 shrink-0 text-right text-xs font-medium text-foreground min-[480px]:block">
        {formatPeso(ingredientRowCost(row, costCtx))}
      </span>
      <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label="Remove" onClick={() => onRemove(row.id)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * Something this shop makes that goes into this product — tablea into ice cream or brandy.
 * Chosen from the product list, measured in that product's own unit, costed at what one of it
 * costs to make. A batch of this product draws it off its own shelf.
 */
function ComponentRowEditor({
  row,
  options,
  onUpdate,
  onRemove,
}: {
  row: RecipeComponentRow;
  options: Product[];
  onUpdate: (id: string, patch: Partial<RecipeComponentRow>) => void;
  onRemove: (id: string) => void;
}) {
  const qtyField = useNumericDraft(row.quantity, (n) => onUpdate(row.id, { quantity: n }));
  const costCtx = useCostContext();
  const component = options.find((p) => p.id === row.productId);
  const unitCost = component ? productCostPerJar(component, costCtx).costPerJar : 0;
  return (
    <div className="flex items-center gap-2">
      <select
        value={row.productId}
        onChange={(e) => onUpdate(row.id, { productId: e.target.value })}
        aria-label="In-house ingredient"
        className="h-11 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Input
        type="number"
        inputMode="decimal"
        aria-label="Quantity"
        value={qtyField.value}
        onChange={(e) => qtyField.onChange(e.target.value)}
        className="h-11 w-20 shrink-0 text-right text-sm"
      />
      <span className="w-10 shrink-0 text-xs text-muted-foreground">{component?.unit || "pcs"}</span>
      <span className="hidden w-20 shrink-0 text-right text-xs font-medium text-foreground min-[480px]:block">
        {unitCost > 0 ? formatPeso(unitCost * row.quantity) : "No cost yet"}
      </span>
      <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label="Remove" onClick={() => onRemove(row.id)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function RecipeEditor({ product }: { product: Product }) {
  const { rawMaterials, products } = useStore();
  const components = product.recipeComponents ?? [];
  // Anything else on the product list can go in — tablea into ice cream. Never itself.
  const componentOptions = products.filter((p) => p.id !== product.id);
  function persistComponents(next: RecipeComponentRow[]) {
    updateProduct(product.id, { recipeComponents: next });
  }
  const costCtx = useCostContext();
  const [showMore, setShowMore] = useState(false);
  const [batchCount, setBatchCount] = useState(1);

  const ingredients = product.recipeIngredients;
  // Still written back on every save so the rows survive, but no longer costed: labor now
  // comes from minutes x rate, or from laborCostOverride where one was migrated in.
  const labor = product.recipeLabor;
  const misc = product.recipeMisc;

  const cost = productCostPerJar(product, costCtx);
  const totalForRun = cost.batchTotal * batchCount;
  const jarsForRun = product.batchYield * batchCount;

  // A part-priced recipe has no total; the batch planner below only states one when it's whole.
  const costable = cost.unpriced.length === 0;

  const yieldField = useNumericDraft(product.batchYield, (n) => persist(ingredients, labor, misc, n));


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
    // The Recipe tab of Pricing: what a batch costs, in three blocks. The price itself is set
    // on the Price tab, so it isn't repeated here.
    <div className="space-y-3">
        <CostSection
          title="Recipe"
          total={`${formatPeso(cost.ingredientTotal + cost.packagingTotal)} a batch`}
          action={
            <AddButton onClick={addIngredient} disabled={rawMaterials.length === 0}>
              Add ingredient
            </AddButton>
          }
        >
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">One batch makes</span>
            <Input
              type="number"
              inputMode="numeric"
              aria-label="Units per batch"
              value={yieldField.value}
              onChange={(e) => yieldField.onChange(e.target.value)}
              className="h-11 w-20 text-right"
            />
            <span className="text-muted-foreground">{product.unit || "jars"}</span>
          </div>
          {rawMaterials.length === 0 ? (
            <p className="text-xs text-muted-foreground">No raw materials or packaging yet — add them under Costing first.</p>
          ) : ingredients.length === 0 && components.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recipe yet. Tap &quot;Add ingredient&quot; for each thing that goes into a batch.</p>
          ) : ingredients.length === 0 ? null : (
            <>
              <div className="flex gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="flex-1">Ingredient</span>
                <span className="w-20 text-right">Qty</span>
                <span className="w-10" />
                <span className="hidden w-20 text-right min-[480px]:block">Cost</span>
                <span className="w-11" />
              </div>
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
            </>
          )}
          {componentOptions.length > 0 && (
            <div className="space-y-2 border-t border-line/10 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold">Made in-house</p>
                  <p className="text-xs text-muted-foreground">Something you make that goes into this, like tablea in ice cream.</p>
                </div>
                <AddButton
                  onClick={() =>
                    persistComponents([...components, { id: genRowId("cmp"), productId: componentOptions[0].id, quantity: 0 }])
                  }
                >
                  Add in-house ingredient
                </AddButton>
              </div>
              {components.map((row) => (
                <ComponentRowEditor
                  key={row.id}
                  row={row}
                  options={componentOptions}
                  onUpdate={(id, patch) => persistComponents(components.map((r) => (r.id === id ? { ...r, ...patch } : r)))}
                  onRemove={(id) => persistComponents(components.filter((r) => r.id !== id))}
                />
              ))}
            </div>
          )}
        </CostSection>

        <CostSection title="Labor" total={`${formatPeso(cost.laborTotal)} a batch`}>
          <LaborEditor product={product} hourlyRate={costCtx.hourlyLaborRate} />
        </CostSection>

        <CostSection
          title="Fixed costs"
          total={`${formatPeso(cost.miscTotal)} a batch`}
          hint="Gas, electricity, a share of rent — anything a batch costs besides the recipe and labor."
          action={<AddButton onClick={addMisc}>Add fixed cost</AddButton>}
        >
          {misc.length === 0 ? (
            <p className="text-xs text-muted-foreground">None added.</p>
          ) : (
            misc.map((row) => <ExtraRow key={row.id} row={row} onChange={updateMisc} onRemove={removeMisc} />)
          )}
        </CostSection>

        <Button size="sm" variant="ghost" className="min-h-11 w-full gap-1 text-xs text-muted-foreground" onClick={() => setShowMore((v) => !v)}>
          {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showMore ? "Show less" : "Cost chart and planning several batches"}
        </Button>

        {showMore && (
          <div className="space-y-5 border-t border-border pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">What one {(product.unit || "jar").replace(/s$/, "")} costs to make</Label>
              <CostBreakdownLines cost={cost} />
              <CostBreakdownChart cost={cost} />
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
              {costable && (
                <p className="text-xs text-muted-foreground">
                  Cost per jar stays {formatPeso(cost.costPerJar)} no matter how many batches you make.
                </p>
              )}
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
    </div>
  );
}
