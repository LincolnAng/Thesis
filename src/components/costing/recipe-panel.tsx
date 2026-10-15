"use client";

import { Plus, Trash2 } from "lucide-react";
import { LaborEditor } from "@/components/finance/labor-editor";
import { updateProduct } from "@/lib/store/store";
import { useStore } from "@/lib/store/use-store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { ingredientRowCost, productCostPerJar } from "@/lib/summary/recipe-cost";
import { groupOf } from "@/lib/summary/material-stock";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import { formatPeso } from "@/lib/format";
import type { Product, RawMaterialStock, RecipeComponentRow, RecipeExtraRow, RecipeIngredientRow } from "@/lib/store/types";

/**
 * The Recipe tab: what one batch takes, as four short lists in the order a batch is made —
 *
 *   Makes [12] jars a batch
 *   Ingredients   — bought ones and ones you make yourself (tablea), in one list
 *   Packaging     — jars, lids, labels
 *   Your time     — minutes × your hourly rate
 *   Other costs   — gas, electricity, a share of rent
 *
 * Each list shows its total for the batch beside its heading. Everything saves as it is typed.
 */

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const input = "h-10 rounded-lg border border-input bg-transparent px-2 text-[14px] outline-none focus:border-cacao";

export function RecipePanel({ product }: { product: Product }) {
  const { rawMaterials, products } = useStore();
  const ctx = useCostContext();
  const cost = productCostPerJar(product, ctx);
  const unitWord = product.unit || "jars";

  const ingredientsList = rawMaterials.filter((m) => groupOf(m) === "ingredient");
  const packagingList = rawMaterials.filter((m) => groupOf(m) === "supply");
  const madeByYou = products.filter((p) => p.id !== product.id);
  const isPackagingRow = (r: RecipeIngredientRow) => {
    const m = rawMaterials.find((x) => x.id === r.materialId);
    return !!m && groupOf(m) === "supply";
  };

  const rows = product.recipeIngredients;
  const components = product.recipeComponents ?? [];
  const ingredientRows = rows.filter((r) => !isPackagingRow(r));
  const packagingRows = rows.filter(isPackagingRow);
  const componentCost = cost.ingredientLines.filter((l) => l.name.endsWith("(made in-house)")).reduce((s, l) => s + l.batchCost, 0);

  const saveRows = (next: RecipeIngredientRow[]) => updateProduct(product.id, { recipeIngredients: next });
  const saveComponents = (next: RecipeComponentRow[]) => updateProduct(product.id, { recipeComponents: next });
  const saveMisc = (next: RecipeExtraRow[]) => updateProduct(product.id, { recipeMisc: next });
  const patchRow = (id: string, patch: Partial<RecipeIngredientRow>) => saveRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const patchComponent = (id: string, patch: Partial<RecipeComponentRow>) => saveComponents(components.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  /** Ingredient rows pick from bought ingredients and things you make; switching between the two moves the row. */
  function pickIngredient(kind: "m" | "p", rowId: string, value: string) {
    const [nextKind, id] = value.split(":") as ["m" | "p", string];
    if (nextKind === kind) {
      if (kind === "m") patchRow(rowId, { materialId: id });
      else patchComponent(rowId, { productId: id });
      return;
    }
    if (kind === "m") {
      const row = rows.find((r) => r.id === rowId);
      updateProduct(product.id, {
        recipeIngredients: rows.filter((r) => r.id !== rowId),
        recipeComponents: [...components, { id: newId("cmp"), productId: id, quantity: row?.quantity ?? 0 }],
      });
    } else {
      const row = components.find((r) => r.id === rowId);
      updateProduct(product.id, {
        recipeComponents: components.filter((r) => r.id !== rowId),
        recipeIngredients: [...rows, { id: newId("ing"), materialId: id, quantity: row?.quantity ?? 0 }],
      });
    }
  }

  const ingredientOptions = (
    <>
      {ingredientsList.length > 0 && (
        <optgroup label="Bought">
          {ingredientsList.map((m) => (
            <option key={m.id} value={`m:${m.id}`}>
              {m.name}
            </option>
          ))}
        </optgroup>
      )}
      {madeByYou.length > 0 && (
        <optgroup label="Made by you">
          {madeByYou.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );

  return (
    <div className="flex flex-col divide-y divide-line/10">
      <div className="flex flex-wrap items-center gap-2 pb-4 text-[14px]">
        <span>Makes</span>
        <YieldInput product={product} />
        <span>{unitWord} a batch</span>
      </div>

      <Section
        title="Ingredients"
        total={cost.ingredientTotal}
        addLabel="Add ingredient"
        onAdd={() => {
          if (ingredientsList[0]) saveRows([...rows, { id: newId("ing"), materialId: ingredientsList[0].id, quantity: 0 }]);
          else if (madeByYou[0]) saveComponents([...components, { id: newId("cmp"), productId: madeByYou[0].id, quantity: 0 }]);
        }}
        canAdd={ingredientsList.length > 0 || madeByYou.length > 0}
        emptyText={
          ingredientsList.length === 0 && madeByYou.length === 0
            ? "No ingredients to pick from yet — add them under Raw materials first."
            : "Nothing yet. Add each thing that goes into one batch."
        }
        count={ingredientRows.length + components.length}
        note={componentCost > 0 ? `Includes ${formatPeso(componentCost)} of things you make yourself.` : undefined}
      >
        {ingredientRows.map((r) => (
          <Line
            key={r.id}
            select={
              <select value={`m:${r.materialId}`} onChange={(e) => pickIngredient("m", r.id, e.target.value)} aria-label="Ingredient" className={`${input} min-w-0 flex-1`}>
                {ingredientOptions}
              </select>
            }
            qty={r.quantity}
            onQty={(n) => patchRow(r.id, { quantity: n })}
            unit={rawMaterials.find((m) => m.id === r.materialId)?.unit ?? ""}
            cost={formatPeso(ingredientRowCost(r, ctx))}
            onRemove={() => saveRows(rows.filter((x) => x.id !== r.id))}
          />
        ))}
        {components.map((r) => {
          const made = products.find((p) => p.id === r.productId);
          const each = made ? productCostPerJar(made, ctx).costPerJar : 0;
          return (
            <Line
              key={r.id}
              select={
                <select value={`p:${r.productId}`} onChange={(e) => pickIngredient("p", r.id, e.target.value)} aria-label="Ingredient" className={`${input} min-w-0 flex-1`}>
                  {ingredientOptions}
                </select>
              }
              qty={r.quantity}
              onQty={(n) => patchComponent(r.id, { quantity: n })}
              unit={made?.unit || "pcs"}
              cost={each > 0 ? formatPeso(each * r.quantity) : "No cost yet"}
              onRemove={() => saveComponents(components.filter((x) => x.id !== r.id))}
            />
          );
        })}
      </Section>

      <Section
        title="Packaging"
        total={cost.packagingTotal}
        addLabel="Add packaging"
        onAdd={() => packagingList[0] && saveRows([...rows, { id: newId("ing"), materialId: packagingList[0].id, quantity: 0 }])}
        canAdd={packagingList.length > 0}
        emptyText={packagingList.length === 0 ? "No packaging to pick from yet — add jars, lids or labels under Packaging first." : "None yet. Add the jars, lids or labels one batch uses."}
        count={packagingRows.length}
      >
        {packagingRows.map((r) => (
          <Line
            key={r.id}
            select={
              <select value={r.materialId} onChange={(e) => patchRow(r.id, { materialId: e.target.value })} aria-label="Packaging" className={`${input} min-w-0 flex-1`}>
                {packagingList.map((m: RawMaterialStock) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            }
            qty={r.quantity}
            onQty={(n) => patchRow(r.id, { quantity: n })}
            unit={rawMaterials.find((m) => m.id === r.materialId)?.unit ?? ""}
            cost={formatPeso(ingredientRowCost(r, ctx))}
            onRemove={() => saveRows(rows.filter((x) => x.id !== r.id))}
          />
        ))}
      </Section>

      <Section title="Your time" total={cost.laborTotal} count={1}>
        <LaborEditor product={product} hourlyRate={ctx.hourlyLaborRate} />
      </Section>

      <Section
        title="Other costs"
        hint="Gas, electricity, a share of rent — anything else a batch costs."
        total={cost.miscTotal}
        addLabel="Add a cost"
        onAdd={() => saveMisc([...product.recipeMisc, { id: newId("misc"), label: "", cost: 0 }])}
        canAdd
        emptyText="None added."
        count={product.recipeMisc.length}
      >
        {product.recipeMisc.map((r) => (
          <OtherCost
            key={r.id}
            row={r}
            onChange={(patch) => saveMisc(product.recipeMisc.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))}
            onRemove={() => saveMisc(product.recipeMisc.filter((x) => x.id !== r.id))}
          />
        ))}
      </Section>

      <div className="flex items-baseline justify-between pt-4">
        <span className="text-[14px] font-semibold">One batch costs</span>
        <span className="font-display text-[20px] font-bold tabular-nums">
          {cost.unpriced.length > 0 ? <span className="text-[14px] font-semibold text-muted-foreground">Not known yet</span> : formatPeso(cost.batchTotal)}
        </span>
      </div>
    </div>
  );
}

function YieldInput({ product }: { product: Product }) {
  const field = useNumericDraft(product.batchYield, (n) => updateProduct(product.id, { batchYield: n }));
  return (
    <input
      inputMode="numeric"
      aria-label="How many one batch makes"
      value={field.value}
      onChange={(e) => field.onChange(e.target.value.replace(/[^0-9.]/g, ""))}
      className={`${input} w-20 text-center font-semibold`}
    />
  );
}

function Section({
  title,
  hint,
  total,
  addLabel,
  onAdd,
  canAdd,
  emptyText,
  count,
  note,
  children,
}: {
  title: string;
  hint?: string;
  total: number;
  addLabel?: string;
  onAdd?: () => void;
  canAdd?: boolean;
  emptyText?: string;
  count: number;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[15px] font-semibold">{title}</h4>
        <span className="text-[13px] text-muted-foreground tabular-nums">{formatPeso(total)} a batch</span>
      </div>
      {hint && <p className="-mt-1.5 text-[12.5px] text-muted-foreground">{hint}</p>}
      {count === 0 && emptyText ? <p className="text-[13px] text-muted-foreground">{emptyText}</p> : children}
      {note && <p className="text-[12.5px] text-muted-foreground">{note}</p>}
      {addLabel && onAdd && (
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          className="flex min-h-9 w-fit items-center gap-1 text-[13px] font-semibold text-cacao disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> {addLabel}
        </button>
      )}
    </section>
  );
}

/** One recipe line: what, how much, in what, what it costs a batch. */
function Line({
  select,
  qty,
  onQty,
  unit,
  cost,
  onRemove,
}: {
  select: React.ReactNode;
  qty: number;
  onQty: (n: number) => void;
  unit: string;
  cost: string;
  onRemove: () => void;
}) {
  const field = useNumericDraft(qty, onQty);
  return (
    <div className="flex items-center gap-2">
      {select}
      <input
        inputMode="decimal"
        aria-label="How much"
        value={field.value}
        onChange={(e) => field.onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        className={`${input} w-20 shrink-0 text-right`}
      />
      <span className="w-10 shrink-0 text-[12.5px] text-muted-foreground">{unit}</span>
      <span className="hidden w-24 shrink-0 text-right text-[13px] tabular-nums min-[480px]:block">{cost}</span>
      <button type="button" onClick={onRemove} aria-label="Remove" className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-danger">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function OtherCost({ row, onChange, onRemove }: { row: RecipeExtraRow; onChange: (patch: Partial<RecipeExtraRow>) => void; onRemove: () => void }) {
  const field = useNumericDraft(row.cost, (n) => onChange({ cost: n }));
  return (
    <div className="flex items-center gap-2">
      <input value={row.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="What for?" className={`${input} min-w-0 flex-1`} />
      <span className="text-[13px] text-muted-foreground">₱</span>
      <input
        inputMode="decimal"
        aria-label="Cost a batch"
        value={field.value}
        onChange={(e) => field.onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        className={`${input} w-24 shrink-0 text-right`}
      />
      <button type="button" onClick={onRemove} aria-label="Remove" className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-danger">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
