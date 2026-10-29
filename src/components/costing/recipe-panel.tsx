"use client";

import { useState } from "react";
import { Check, ChevronDown, ListChecks, Plus, Search, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { updateProduct } from "@/lib/store/store";
import { perBatch, perUnit, unitsPerBatch } from "@/lib/costing/per-unit";
import { useStore } from "@/lib/store/use-store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { ingredientRowCost, productCostPerJar } from "@/lib/summary/recipe-cost";
import { groupOf } from "@/lib/summary/material-stock";
import { getUnitCost } from "@/lib/summary/cost-engine";
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
 * Ingredients and packaging are only ever picked, never priced here: open the checklist, tick
 * every raw material that goes in (with how much one takes, if known), and add them all at once. Its price is the one on the Raw materials /
 * Packaging tab — the same figure, from the same purchases — so there is one price per material
 * and nothing to type twice.
 *
 * Each shows its cost per unit beside its heading, and what one costs to make sits at the
 * bottom — this is the whole cost, so there is no separate cost page. Below it, a planner for
 * making a batch of any size. The recipe
 * is stored as one batch's worth for production (see lib/costing/per-unit), so every amount here
 * is converted on the way in and out. Everything saves as it is typed.
 */

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const input = "h-10 rounded-lg border border-input bg-transparent px-2 text-[14px] outline-none focus:border-cacao";
/** The recipe's spreadsheet columns: item · measurement · price per unit · cost · remove. */
const GRID = "grid grid-cols-[minmax(0,1.5fr)_170px_130px_110px_48px]";
const CELL = "min-w-0 border-r border-line/10 px-3 py-2 last:border-r-0";

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

  // The price per unit of each material — the same figure the Raw materials and Packaging tabs show.
  const priceOf = (materialId: string) => {
    const u = getUnitCost(materialId, ctx.rawMaterials, ctx.supplierPrices, ctx.entries, ctx.products, ctx.cacaoUtilization);
    return u.source === "none" ? null : u.cost;
  };
  const inRecipe = new Set([...rows.map((r) => r.materialId), ...components.map((c) => c.productId)]);
  const materialOption = (m: RawMaterialStock, group?: string): Option => {
    const price = priceOf(m.id);
    return { key: `m:${m.id}`, label: m.name, hint: price != null ? `${formatPeso(price)}/${m.unit}` : "no price yet", unit: m.unit, group, added: inRecipe.has(m.id) };
  };
  const ingredientOptions: Option[] = [
    ...ingredientsList.map((m) => materialOption(m, "Raw materials")),
    ...madeByYou.map((p) => {
      const each = productCostPerJar(p, ctx).costPerJar;
      return { key: `p:${p.id}`, label: p.name, hint: each > 0 ? `${formatPeso(each)} each` : "no cost yet", unit: p.unit || "pcs", group: "Made by you", added: inRecipe.has(p.id) };
    }),
  ];
  const packagingOptions: Option[] = packagingList.map((m) => materialOption(m));

  // Everything ticked in the checklist goes in at once; amounts are typed per one and stored per batch.
  function addPicked(picked: Picked[]) {
    const newRows = picked.filter((x) => x.key.startsWith("m:")).map((x) => ({ id: newId("ing"), materialId: x.key.slice(2), quantity: perBatch(product, x.qty) }));
    const newComponents = picked.filter((x) => x.key.startsWith("p:")).map((x) => ({ id: newId("cmp"), productId: x.key.slice(2), quantity: perBatch(product, x.qty) }));
    const patch: Partial<Product> = {};
    if (newRows.length) patch.recipeIngredients = [...rows, ...newRows];
    if (newComponents.length) patch.recipeComponents = [...components, ...newComponents];
    if (newRows.length || newComponents.length) save(patch);
  }
  const materialPrice = (r: RecipeIngredientRow) => {
    const m = rawMaterials.find((x) => x.id === r.materialId);
    const price = priceOf(r.materialId);
    return price != null && m ? `at ${formatPeso(price)}/${m.unit}` : "no price yet";
  };

  const qtyProps = (batchQty: number, onBatch: (n: number) => void) => ({
    qty: perUnit(product, batchQty),
    onQty: (n: number) => onBatch(perBatch(product, n)),
  });

  return (
    <div className="flex flex-col divide-y divide-line/10">
      <p className="pb-3 text-[14px]">
        The recipe book and its costing: what goes into <span className="font-semibold">one {unit}</span>, how much, and what it costs. Batches can be any size — the cost of one {unit} stays the same.
      </p>

      <Section
        title="Ingredients"
        total={one(cost.ingredientTotal)}
        unit={unit}
        emptyText={
          ingredientsList.length === 0 && madeByYou.length === 0
            ? "No raw materials yet — add them on the Raw materials tab first."
            : `Nothing yet. Tick every raw material that goes into one ${unit}.`
        }
        count={ingredientRows.length + components.length}
        note={componentCost > 0 ? `Includes ${formatPeso(one(componentCost))} of things you make yourself.` : undefined}
        search={<ChecklistAdd label="Add ingredients" title="Which ingredients go in?" unit={unit} options={ingredientOptions} defaultQty={0} onAdd={addPicked} />}
      >
        {ingredientRows.map((r) => {
          const m = rawMaterials.find((x) => x.id === r.materialId);
          return (
            <Line
              key={r.id}
              name={m?.name ?? "Removed ingredient"}
              {...qtyProps(r.quantity, (n) => patchRow(r.id, { quantity: n }))}
              unit={m?.unit ?? ""}
              price={materialPrice(r)}
              cost={priceText(one(ingredientRowCost(r, ctx)), cost.unpriced, m?.name)}
              onRemove={() => saveRows(rows.filter((x) => x.id !== r.id))}
            />
          );
        })}
        {components.map((r) => {
          const made = products.find((p) => p.id === r.productId);
          const each = made ? productCostPerJar(made, ctx).costPerJar : 0;
          return (
            <Line
              key={r.id}
              name={made?.name ?? "Removed product"}
              tag="made by you"
              {...qtyProps(r.quantity, (n) => patchComponent(r.id, { quantity: n }))}
              unit={made?.unit || "pcs"}
              price={each > 0 ? `at ${formatPeso(each)} each` : "no cost yet"}
              cost={each > 0 ? formatPeso(one(each * r.quantity)) : "No cost yet"}
              onRemove={() => saveComponents(components.filter((x) => x.id !== r.id))}
            />
          );
        })}
      </Section>

      <Section
        title="Packaging"
        itemLabel="Packaging"
        total={one(cost.packagingTotal)}
        unit={unit}
        emptyText={packagingList.length === 0 ? "No packaging yet — add jars, lids or labels on the Packaging tab first." : `None yet. Tick the jar, lid and label one ${unit} uses.`}
        count={packagingRows.length}
        search={<ChecklistAdd label="Add packaging" title="Which packaging does it use?" unit={unit} options={packagingOptions} defaultQty={1} onAdd={addPicked} />}
      >
        {packagingRows.map((r) => {
          const m = rawMaterials.find((x) => x.id === r.materialId);
          return (
            <Line
              key={r.id}
              name={m?.name ?? "Removed packaging"}
              {...qtyProps(r.quantity, (n) => patchRow(r.id, { quantity: n }))}
              unit={m?.unit ?? ""}
              price={materialPrice(r)}
              cost={priceText(one(ingredientRowCost(r, ctx)), cost.unpriced, m?.name)}
              onRemove={() => saveRows(rows.filter((x) => x.id !== r.id))}
            />
          );
        })}
      </Section>

      <Section
        title="Other costs"
        itemLabel="Item"
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
  search,
  itemLabel,
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
  /** A search bar for adding, shown under the list. */
  search?: React.ReactNode;
  /** The first column's heading — Ingredient, Packaging, Item. */
  itemLabel?: string;
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
      {count === 0 && emptyText ? (
        <p className="text-[13px] text-muted-foreground">{emptyText}</p>
      ) : (
        // A spreadsheet, like the Transactions table: a ruled grid with a heading row and a total.
        <div className="overflow-x-auto rounded-xl border border-line/15">
          <div className="min-w-[560px]">
            <div className={`${GRID} border-b border-line/15 bg-secondary text-[11px] font-bold uppercase tracking-wide text-muted-foreground`}>
              <span className={CELL}>{itemLabel ?? "Ingredient"}</span>
              <span className={`${CELL} text-center`}>Measurement</span>
              <span className={`${CELL} text-center`}>Price per unit</span>
              <span className={`${CELL} text-right`}>Cost</span>
              <span className={CELL} />
            </div>
            <div className="divide-y divide-line/10 [&>*:nth-child(even)]:bg-secondary/30">{children}</div>
            <div className={`${GRID} border-t border-line/15 bg-secondary/60 text-[13.5px] font-semibold`}>
              <span className={CELL}>Total</span>
              <span className={CELL} />
              <span className={CELL} />
              <span className={`${CELL} text-right tabular-nums`}>{formatPeso(total)}</span>
              <span className={CELL} />
            </div>
          </div>
        </div>
      )}
      {note && <p className="text-[12.5px] text-muted-foreground">{note}</p>}
      {search}
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

/** One recipe line: what (picked, not typed), how much goes into one, its price, and what that comes to. */
function Line({
  name,
  tag,
  qty,
  onQty,
  unit,
  price,
  cost,
  onRemove,
}: {
  name: string;
  tag?: string;
  qty: number;
  onQty: (n: number) => void;
  unit: string;
  /** The material's price per unit, as the Raw materials tab has it — read-only. */
  price: string;
  cost: string;
  onRemove: () => void;
}) {
  const field = useNumericDraft(qty, onQty);
  return (
    <div className={`${GRID} items-center bg-card`}>
      <span className={`${CELL} text-[14px] font-medium`}>
        {name}
        {tag && <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{tag}</span>}
      </span>
      <span className={`${CELL} flex items-center justify-center gap-1.5`}>
        <input
          inputMode="decimal"
          aria-label={`How much ${name} goes into one`}
          value={field.value}
          onChange={(e) => field.onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          className={`${input} w-20 text-right`}
        />
        <span className="w-10 text-[12.5px] text-muted-foreground">{unit}</span>
      </span>
      <span className={`${CELL} text-center text-[12.5px] text-muted-foreground tabular-nums`}>{price.replace(/^at /, "")}</span>
      <span className={`${CELL} text-right text-[13.5px] font-semibold tabular-nums`}>{cost}</span>
      <span className={`${CELL} flex justify-center`}>
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-danger">
          <Trash2 className="h-4 w-4" />
        </button>
      </span>
    </div>
  );
}

interface Option {
  key: string;
  label: string;
  hint: string;
  unit: string;
  group?: string;
  /** Already in the recipe — shown ticked, can't be added twice. */
  added?: boolean;
}

interface Picked {
  key: string;
  /** How much goes into one; 0 when left blank, to fill in on the recipe. */
  qty: number;
}

/**
 * The Add button and its checklist: every raw material in one list, tick all that go in — with how
 * much one takes, if known — and add them in one go. Their prices come with them.
 */
function ChecklistAdd({ label, title, unit, options, defaultQty, onAdd }: { label: string; title: string; unit: string; options: Option[]; defaultQty: number; onAdd: (picked: Picked[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [ticked, setTicked] = useState<Map<string, string>>(new Map());
  const needle = q.trim().toLowerCase();
  const shown = options.filter((o) => !needle || o.label.toLowerCase().includes(needle));
  const left = options.filter((o) => !o.added).length;

  function close() {
    setOpen(false);
    setQ("");
    setTicked(new Map());
  }
  function toggle(key: string) {
    setTicked((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, defaultQty > 0 ? String(defaultQty) : "");
      return next;
    });
  }
  function add() {
    onAdd([...ticked].map(([key, qty]) => ({ key, qty: Number(qty) || 0 })));
    close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={options.length === 0}
        className="flex h-10 w-fit items-center gap-2 rounded-lg border border-dashed border-line/30 px-3 text-[14px] font-semibold text-cacao hover:border-solid hover:border-cacao disabled:opacity-40"
      >
        <ListChecks className="h-4 w-4" /> {label}
      </button>
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="flex max-h-[88svh] flex-col gap-3 rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Tick everything that goes into one {unit}. Type how much one takes if you know it — or leave it and fill it in on the recipe.
            </DialogDescription>
          </DialogHeader>
          {options.length > 8 && (
            <label className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-input px-3 focus-within:border-cacao">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find one…" aria-label="Find a material" className="w-full bg-transparent text-[14px] outline-none placeholder:text-muted-foreground" />
            </label>
          )}
          <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {shown.length === 0 && <li className="py-3 text-[13px] text-muted-foreground">Nothing matches — add it on the Raw materials or Packaging tab first.</li>}
            {shown.map((o, i) => {
              const on = ticked.has(o.key);
              return (
                <li key={o.key}>
                  {o.group && o.group !== shown[i - 1]?.group && <div className="px-1 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground first:pt-0">{o.group}</div>}
                  <div className={`flex min-h-12 items-center gap-3 rounded-lg px-2 ${on ? "bg-secondary" : ""} ${o.added ? "opacity-55" : ""}`}>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2">
                      <input type="checkbox" checked={on || !!o.added} disabled={o.added} onChange={() => toggle(o.key)} className="h-5 w-5 shrink-0 accent-cacao" />
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium">{o.label}</span>
                        <span className="block text-[12px] text-muted-foreground tabular-nums">{o.added ? "Already in the recipe" : o.hint}</span>
                      </span>
                    </label>
                    {on && (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <input
                          inputMode="decimal"
                          autoFocus
                          value={ticked.get(o.key) ?? ""}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9.]/g, "");
                            setTicked((prev) => new Map(prev).set(o.key, v));
                          }}
                          placeholder="How much"
                          aria-label={`How much ${o.label} goes into one`}
                          className={`${input} w-24 bg-card text-right`}
                        />
                        <span className="w-10 text-[12.5px] text-muted-foreground">{o.unit}</span>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex shrink-0 items-center gap-2 border-t border-line/10 pt-3">
            <span className="flex-1 text-[13px] text-muted-foreground">{left === 0 ? "Everything is already in the recipe." : `${ticked.size} ticked`}</span>
            <button type="button" onClick={close} className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold">
              Cancel
            </button>
            <button type="button" disabled={ticked.size === 0} onClick={add} className="flex min-h-11 items-center gap-1.5 rounded-[10px] bg-cacao px-4 text-[14px] font-semibold text-ivory disabled:opacity-40">
              <Check className="h-4 w-4" /> Add {ticked.size > 0 ? ticked.size : ""}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
    <div className={`${GRID} items-center bg-card`}>
      <span className={CELL}>
        <input value={row.label} onChange={(e) => onLabel(e.target.value)} placeholder="What for?" className={`${input} w-full`} />
      </span>
      <span className={`${CELL} text-center text-[12.5px] text-muted-foreground`}>—</span>
      <span className={`${CELL} text-center text-[12.5px] text-muted-foreground`}>—</span>
      <span className={`${CELL} flex items-center justify-end gap-1`}>
        <span className="text-[13px] text-muted-foreground">₱</span>
        <input
          inputMode="decimal"
          aria-label="Cost for one"
          value={field.value}
          onChange={(e) => field.onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          className={`${input} w-20 text-right`}
        />
      </span>
      <span className={`${CELL} flex justify-center`}>
        <button type="button" onClick={onRemove} aria-label="Remove" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-danger">
          <Trash2 className="h-4 w-4" />
        </button>
      </span>
    </div>
  );
}
