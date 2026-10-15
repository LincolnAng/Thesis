"use client";

import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { updateProduct } from "@/lib/store/store";
import { perBatch, perUnit, unitsPerBatch } from "@/lib/costing/per-unit";
import { useStore } from "@/lib/store/use-store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { ingredientRowCost, productCostPerJar } from "@/lib/summary/recipe-cost";
import { groupOf } from "@/lib/summary/material-stock";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import { formatPeso } from "@/lib/format";
import type { Product, RawMaterialStock, RecipeComponentRow, RecipeExtraRow, RecipeIngredientRow } from "@/lib/store/types";

/**
 * The Recipe tab: what goes into ONE unit — one jar, one pack — because batches vary in size and
 * a cost per batch would change every time. Three short lists, in the order it's made:
 *
 *   Ingredients — bought ones and ones you make yourself (tablea), in one list
 *   Packaging   — the jar, lid, label
 *   Other costs — anything else one costs
 *
 * Your time isn't a cost here (see batchLaborCost in lib/summary/cost-engine).
 *
 * Each shows its cost per unit beside its heading, and what one costs to make sits at the
 * bottom — this is the whole cost, so there is no separate cost page. Below it, a planner for
 * making a batch of any size. The recipe
 * is stored as one batch's worth for production (see lib/costing/per-unit), so every amount here
 * is converted on the way in and out. Everything saves as it is typed.
 */

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const input = "h-10 rounded-lg border border-input bg-transparent px-2 text-[14px] outline-none focus:border-cacao";

export function RecipePanel({ product }: { product: Product }) {
  const { rawMaterials, products } = useStore();
  const ctx = useCostContext();
  const cost = productCostPerJar(product, ctx);
  const unit = (product.unit || "jar").replace(/s$/, "");
  const one = (batchAmount: number) => batchAmount / unitsPerBatch(product);
  // Every edit also fixes a missing batch size at 1, so what's typed per unit is stored as such.
  const save = (patch: Partial<Product>) => updateProduct(product.id, product.batchYield > 0 ? patch : { ...patch, batchYield: 1 });

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

  const saveRows = (next: RecipeIngredientRow[]) => save({ recipeIngredients: next });
  const saveComponents = (next: RecipeComponentRow[]) => save({ recipeComponents: next });
  const saveMisc = (next: RecipeExtraRow[]) => save({ recipeMisc: next });
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
      save({
        recipeIngredients: rows.filter((r) => r.id !== rowId),
        recipeComponents: [...components, { id: newId("cmp"), productId: id, quantity: row?.quantity ?? 0 }],
      });
    } else {
      const row = components.find((r) => r.id === rowId);
      save({
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

  const qtyProps = (batchQty: number, onBatch: (n: number) => void) => ({
    qty: perUnit(product, batchQty),
    onQty: (n: number) => onBatch(perBatch(product, n)),
  });

  return (
    <div className="flex flex-col divide-y divide-line/10">
      <p className="pb-3 text-[14px]">
        What goes into <span className="font-semibold">one {unit}</span>. Batches can be any size — the cost of one {unit} stays the same.
      </p>

      <Section
        title="Ingredients"
        total={one(cost.ingredientTotal)}
        unit={unit}
        addLabel="Add ingredient"
        onAdd={() => {
          if (ingredientsList[0]) saveRows([...rows, { id: newId("ing"), materialId: ingredientsList[0].id, quantity: 0 }]);
          else if (madeByYou[0]) saveComponents([...components, { id: newId("cmp"), productId: madeByYou[0].id, quantity: 0 }]);
        }}
        canAdd={ingredientsList.length > 0 || madeByYou.length > 0}
        emptyText={
          ingredientsList.length === 0 && madeByYou.length === 0
            ? "No ingredients to pick from yet — add them under Raw materials first."
            : `Nothing yet. Add each thing that goes into one ${unit}.`
        }
        count={ingredientRows.length + components.length}
        note={componentCost > 0 ? `Includes ${formatPeso(one(componentCost))} of things you make yourself.` : undefined}
      >
        {ingredientRows.map((r) => (
          <Line
            key={r.id}
            select={
              <select value={`m:${r.materialId}`} onChange={(e) => pickIngredient("m", r.id, e.target.value)} aria-label="Ingredient" className={`${input} min-w-0 flex-1`}>
                {ingredientOptions}
              </select>
            }
            {...qtyProps(r.quantity, (n) => patchRow(r.id, { quantity: n }))}
            unit={rawMaterials.find((m) => m.id === r.materialId)?.unit ?? ""}
            cost={priceText(one(ingredientRowCost(r, ctx)), cost.unpriced, rawMaterials.find((m) => m.id === r.materialId)?.name)}
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
              {...qtyProps(r.quantity, (n) => patchComponent(r.id, { quantity: n }))}
              unit={made?.unit || "pcs"}
              cost={each > 0 ? formatPeso(one(each * r.quantity)) : "No cost yet"}
              onRemove={() => saveComponents(components.filter((x) => x.id !== r.id))}
            />
          );
        })}
      </Section>

      <Section
        title="Packaging"
        total={one(cost.packagingTotal)}
        unit={unit}
        addLabel="Add packaging"
        onAdd={() => packagingList[0] && saveRows([...rows, { id: newId("ing"), materialId: packagingList[0].id, quantity: 1 * unitsPerBatch(product) }])}
        canAdd={packagingList.length > 0}
        emptyText={packagingList.length === 0 ? "No packaging to pick from yet — add jars, lids or labels under Packaging first." : `None yet. Add the jar, lid or label one ${unit} uses.`}
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
            {...qtyProps(r.quantity, (n) => patchRow(r.id, { quantity: n }))}
            unit={rawMaterials.find((m) => m.id === r.materialId)?.unit ?? ""}
            cost={priceText(one(ingredientRowCost(r, ctx)), cost.unpriced, rawMaterials.find((m) => m.id === r.materialId)?.name)}
            onRemove={() => saveRows(rows.filter((x) => x.id !== r.id))}
          />
        ))}
      </Section>

      <Section
        title="Other costs"
        hint={`Anything else one ${unit} costs — a sticker, a share of gas or delivery.`}
        total={one(cost.miscTotal)}
        unit={unit}
        addLabel="Add other cost"
        onAdd={() => saveMisc([...product.recipeMisc, { id: newId("misc"), label: "", cost: 0 }])}
        canAdd
        emptyText="None added."
        count={product.recipeMisc.length}
      >
        {product.recipeMisc.map((r) => (
          <OtherCost
            key={r.id}
            row={r}
            perUnit={perUnit(product, r.cost)}
            onCost={(n) => saveMisc(product.recipeMisc.map((x) => (x.id === r.id ? { ...x, cost: perBatch(product, n) } : x)))}
            onLabel={(label) => saveMisc(product.recipeMisc.map((x) => (x.id === r.id ? { ...x, label } : x)))}
            onRemove={() => saveMisc(product.recipeMisc.filter((x) => x.id !== r.id))}
          />
        ))}
      </Section>

      <div className="flex items-baseline justify-between pt-4">
        <span className="text-[14px] font-semibold">One {unit} costs</span>
        <span className="font-display text-[20px] font-bold tabular-nums">
          {cost.unpriced.length > 0 ? <span className="text-[14px] font-semibold text-muted-foreground">Not known yet</span> : formatPeso(one(cost.batchTotal))}
        </span>
      </div>
      <div className="pt-4">
        <RunPlanner product={product} costEach={one(cost.batchTotal)} costKnown={cost.unpriced.length === 0} />
      </div>
    </div>
  );
}

/** A line's cost, or — when its ingredient has no price yet — says so instead of showing ₱0. */
function priceText(amount: number, unpriced: string[], name: string | undefined): string {
  return name && unpriced.includes(name) ? "No price yet" : formatPeso(amount);
}

/** Making N: what they'd cost, and which ingredients you'd run short of. */
function RunPlanner({ product, costEach, costKnown }: { product: Product; costEach: number; costKnown: boolean }) {
  const { rawMaterials } = useStore();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(String(product.batchYield > 0 ? product.batchYield : 20));
  const n = Math.max(0, Number(count) || 0);
  const short = product.recipeIngredients
    .map((r) => {
      const m = rawMaterials.find((x) => x.id === r.materialId);
      if (!m) return null;
      const need = Math.round(perUnit(product, r.quantity) * n * 100) / 100;
      const gap = Math.round((need - m.qty) * 100) / 100;
      return gap > 0 ? { name: m.name, unit: m.unit, have: m.qty, need, gap } : null;
    })
    .filter((x) => x !== null);

  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-1 text-[13px] font-semibold text-cacao">
        Planning to make a batch?
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl bg-secondary/50 p-3 text-[14px]">
          <label className="flex items-center gap-2">
            <span>Make</span>
            <input
              inputMode="numeric"
              aria-label="How many to make"
              value={count}
              onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-9 w-20 rounded-lg border border-input bg-card text-center font-semibold tabular-nums"
            />
            <span>{product.unit || "jars"}</span>
          </label>
          <p>
            Costs <span className="font-semibold">{formatPeso(costEach * n)}</span> to make
            {costKnown ? "" : " so far — some ingredients have no price yet"}.
          </p>
          {short.map((s) => (
            <p key={s.name} className="text-[13px] text-danger">
              Not enough {s.name} — you have {s.have} {s.unit}, need {s.need} ({s.gap} {s.unit} short).
            </p>
          ))}
          {short.length === 0 && n > 0 && <p className="text-[13px] text-muted-foreground">You have enough of everything for {n} {product.unit || "jars"}.</p>}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  total,
  unit,
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
  unit: string;
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
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {formatPeso(total)} per {unit}
        </span>
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

function OtherCost({
  row,
  perUnit: amount,
  onCost,
  onLabel,
  onRemove,
}: {
  row: RecipeExtraRow;
  perUnit: number;
  onCost: (n: number) => void;
  onLabel: (label: string) => void;
  onRemove: () => void;
}) {
  const field = useNumericDraft(amount, onCost);
  return (
    <div className="flex items-center gap-2">
      <input value={row.label} onChange={(e) => onLabel(e.target.value)} placeholder="What for?" className={`${input} min-w-0 flex-1`} />
      <span className="text-[13px] text-muted-foreground">₱</span>
      <input
        inputMode="decimal"
        aria-label="Cost for one"
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
