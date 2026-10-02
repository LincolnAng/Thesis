"use client";

import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
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
import type { Product, RawMaterialStock, RecipeExtraRow, RecipeIngredientRow } from "@/lib/store/types";

/**
 * What one jar costs to make, and the recipe that decides it.
 *
 * This panel used to carry the whole pricing screen a second time — the method picker, the
 * markup box, the resulting price, the friend and wholesale tiers — all of which are on the
 * page behind it, while the recipe it is named after sat collapsed behind a "See more"
 * link. Opening "Edit recipe & costs" showed you everything except the recipe.
 *
 * So it answers one question now: where ₱63.25 a jar comes from. The figure first, the
 * three things that add up to it beside it, and nothing that belongs to pricing. Planning a
 * production run moved out too — Inventory's "Plan a batch" already does that properly,
 * against live stock.
 */

function genRowId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** A titled box, so the three editable parts of a recipe read as three things, not one list. */
function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line/15 bg-white px-4 py-3.5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Headline figures: the answer, the batch size that scales it, and the batch total. */
function CostHeadline({
  costPerJar,
  batchTotal,
  yieldField,
}: {
  costPerJar: number;
  batchTotal: number;
  yieldField: { value: string; onChange: (v: string) => void };
}) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-3">
      <div className="rounded-xl bg-cacao/[0.06] px-4 py-3">
        <div className="text-xs font-semibold text-muted-foreground">Costs to make one jar</div>
        <div className="font-display text-[26px] font-bold text-cacao">{formatPeso(costPerJar)}</div>
      </div>
      <div className="rounded-xl bg-secondary px-4 py-3">
        <div className="text-xs font-semibold text-muted-foreground">One batch makes</div>
        <div className="flex items-baseline gap-1.5">
          <Input
            type="number"
            inputMode="decimal"
            value={yieldField.value}
            onChange={(e) => yieldField.onChange(e.target.value)}
            className="h-9 w-20 font-display text-[22px] font-bold"
          />
          <span className="text-[13px] text-muted-foreground">jars</span>
        </div>
      </div>
      <div className="rounded-xl bg-secondary px-4 py-3">
        <div className="text-xs font-semibold text-muted-foreground">Cost of one batch</div>
        <div className="font-display text-[26px] font-bold text-foreground">{formatPeso(batchTotal)}</div>
      </div>
    </div>
  );
}

const ING_GRID = "grid grid-cols-[minmax(0,1fr)_76px_40px_92px_32px] items-center gap-2";

/** One ingredient on one line — it used to take two, which made six ingredients a scroll. */
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
    <div className={ING_GRID}>
      <select
        value={row.materialId}
        onChange={(e) => onUpdate(row.id, { materialId: e.target.value })}
        className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
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
        value={qtyField.value}
        onChange={(e) => qtyField.onChange(e.target.value)}
        className="h-8 text-sm"
      />
      <span className="text-xs text-muted-foreground">{material?.unit ?? ""}</span>
      <span className="text-right text-[13px] font-medium tabular-nums text-foreground">
        {formatPeso(ingredientRowCost(row, costCtx))}
      </span>
      <Button size="icon-sm" variant="ghost" className="text-muted-foreground" onClick={() => onRemove(row.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
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
    <div className="grid grid-cols-[minmax(0,1fr)_92px_32px] items-center gap-2">
      <Input
        placeholder="What for?"
        value={row.label}
        onChange={(e) => onChange(row.id, { label: e.target.value })}
        className="h-8 text-sm"
      />
      <Input
        type="number"
        placeholder="₱"
        value={costField.value}
        onChange={(e) => costField.onChange(e.target.value)}
        className="h-8 text-sm"
      />
      <Button size="icon-sm" variant="ghost" className="text-muted-foreground" onClick={() => onRemove(row.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function AddButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={onClick} disabled={disabled}>
      <Plus className="h-3.5 w-3.5" /> {children}
    </Button>
  );
}

export function PricingCalculatorCard({ product }: { product: Product }) {
  const { rawMaterials } = useStore();
  const costCtx = useCostContext();

  const ingredients = product.recipeIngredients;
  // Still written back on every save so the rows survive, but no longer costed: labor now
  // comes from minutes x rate, or from laborCostOverride where one was migrated in.
  const labor = product.recipeLabor;
  const misc = product.recipeMisc;

  const cost = productCostPerJar(product, costCtx);
  const yieldField = useNumericDraft(product.batchYield, (n) => persist(ingredients, labor, misc, n));

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
    persist([...ingredients, { id: genRowId("ing"), materialId: rawMaterials[0].id, quantity: 0 }], labor, misc, product.batchYield);
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
    <div className="space-y-4">
      <CostHeadline costPerJar={cost.costPerJar} batchTotal={cost.batchTotal} yieldField={yieldField} />

      {/* The recipe on the left, what it adds up to on the right — inputs and result side by
          side rather than stacked in one column you have to scroll to connect. */}
      <div className="grid gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_300px] min-[1100px]:items-start">
        <div className="space-y-3">
          <Section
            title="Ingredients"
            hint="What goes into one batch, including jars and labels"
            action={
              <AddButton onClick={addIngredient} disabled={rawMaterials.length === 0}>
                Add ingredient
              </AddButton>
            }
          >
            {rawMaterials.length === 0 ? (
              <p className="text-xs text-muted-foreground">No materials tracked yet — add one under Inventory first.</p>
            ) : ingredients.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing here yet. Tap &quot;Add ingredient&quot; to start.</p>
            ) : (
              <div className="space-y-2">
                <div className={`${ING_GRID} text-[11px] font-bold uppercase tracking-wide text-muted-foreground`}>
                  <span>Item</span>
                  <span>Qty</span>
                  <span />
                  <span className="text-right">Cost</span>
                  <span />
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
              </div>
            )}
          </Section>

          <Section title="Labor" hint="How long one batch takes to make">
            <LaborEditor product={product} hourlyRate={costCtx.hourlyLaborRate} laborPerBatch={cost.laborTotal} />
          </Section>

          <Section
            title="Other costs"
            hint="Electricity, gas, anything else a batch uses"
            action={<AddButton onClick={addMisc}>Add cost</AddButton>}
          >
            {misc.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing here yet — most recipes don&apos;t need this.</p>
            ) : (
              <div className="space-y-2">
                {misc.map((row) => (
                  <ExtraRow key={row.id} row={row} onChange={updateMisc} onRemove={removeMisc} />
                ))}
              </div>
            )}
          </Section>
        </div>

        <Section title="Where the cost goes" hint="Per jar">
          <CostBreakdownLines cost={cost} />
          <div className="mt-3">
            <CostBreakdownChart cost={cost} />
          </div>
        </Section>
      </div>
    </div>
  );
}
