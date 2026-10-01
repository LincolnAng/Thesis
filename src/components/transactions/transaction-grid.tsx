"use client";

import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { addEntry, addSupplier, deleteEntry, replaceEntry } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { entryToDraft, type EntryDraft } from "@/lib/home/describe-entry";
import { deriveCustomers } from "@/lib/summary/customers";
import { nameKey } from "@/lib/summary/name-match";
import { allExpenseCategories } from "@/lib/summary/expenses-summary";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { productUnit } from "@/lib/units";
import { EXPENSE_CATEGORY_LABELS, PRICE_TYPE_LABELS, formatPeso } from "@/lib/format";
import type { Entry, ExpenseCategory, PriceType } from "@/lib/store/types";

/**
 * The transactions table as a spreadsheet: every cell is the control that edits it, in the
 * row where the number lives. No dialog, no row that unfolds into a second form.
 *
 * Typed cells commit when they lose focus or on Enter — one save per field you finish,
 * rather than one per keystroke, which is what made saves pile up and get dropped under the
 * Sheets quota. Dropdowns commit on choice, since there's nothing to finish typing.
 */

const COLUMNS = "grid-cols-[124px_100px_minmax(0,1.1fr)_120px_minmax(0,1fr)_126px_116px_72px]";

// Every cell carries its own box, empty or not: a grid of invisible inputs gives nothing to
// aim at, and "is this editable?" shouldn't depend on guessing.
const CELL =
  "h-8 w-full rounded-md border border-line/15 bg-white px-2 text-[13px] outline-none focus:border-cacao focus:ring-2 focus:ring-cacao/15";

function isoDay(timestamp: string): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Keeps the time of day on an entry whose date is moved, so ordering within a day survives. */
function withDate(timestamp: string, day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const original = new Date(timestamp);
  return new Date(y, m - 1, d, original.getHours(), original.getMinutes(), original.getSeconds()).toISOString();
}

/** A text or number cell that commits once, when you're done with it. */
function CommitCell({
  value,
  onCommit,
  type = "text",
  align = "left",
  placeholder,
  list,
}: {
  value: string;
  onCommit: (value: string) => void;
  type?: "text" | "number";
  align?: "left" | "right";
  placeholder?: string;
  list?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  // While it isn't being typed in, the cell follows the row — so a change made elsewhere
  // (or pulled down from the sheet) doesn't sit there stale.
  const shown = editing ? draft : value;

  return (
    <input
      type={type}
      inputMode={type === "number" ? "decimal" : undefined}
      list={list}
      placeholder={placeholder}
      className={`${CELL} ${align === "right" ? "text-right tabular-nums" : ""} ${type === "number" ? "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" : ""}`}
      value={shown}
      onFocus={() => {
        setDraft(value);
        setEditing(true);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function num(text: string): number | null {
  const n = Number(text);
  return text.trim() === "" || !Number.isFinite(n) ? null : n;
}

export function TransactionGrid({
  rows,
  adding,
  onStartAdding,
  onDoneAdding,
  defaultType,
}: {
  rows: Entry[];
  adding: boolean;
  onStartAdding: () => void;
  onDoneAdding: () => void;
  defaultType: "SALE" | "EXPENSE";
}) {
  const { entries, products, rawMaterials, suppliers, categoryBudgets } = useStore();
  const costCtx = useCostContext();
  const [newRow, setNewRow] = useState<EntryDraft>(() => blankEntryDraft(defaultType, "Added in the table"));

  const itemNames = [...products.map((p) => p.name), ...rawMaterials.map((m) => m.name)];
  const customerNames = deriveCustomers(entries).map((c) => c.name);
  const expenseCategories = allExpenseCategories(categoryBudgets);

  /** The unit the catalog knows for an item — shown beside the quantity, never typed. */
  function unitOf(sku: string | null): string | null {
    if (!sku) return null;
    const product = products.find((p) => p.name === sku);
    if (product) return productUnit(product);
    return rawMaterials.find((m) => m.name === sku)?.unit?.trim() || null;
  }

  function unitPrice(sku: string | null, priceType: PriceType): number | null {
    const product = products.find((p) => p.name === sku);
    if (!product) return null;
    if (priceType === "friend" && product.friendPrice > 0) return product.friendPrice;
    if (priceType === "wholesale" && product.wholesalePrice > 0) return product.wholesalePrice;
    const price = effectiveProductPrice(product, productCostPerJar(product, costCtx));
    return price > 0 ? price : null;
  }

  function patch(entry: Entry, change: Partial<EntryDraft>) {
    const next = { ...entryToDraft(entry), ...change };
    // Keep the unit honest: it belongs to the item, so it follows a change of item.
    if ("sku" in change) next.unit = unitOf(next.sku) ?? next.unit;
    replaceEntry(entry.id, next);
  }

  function changeNew(change: Partial<EntryDraft>) {
    const next = { ...newRow, ...change };
    if ("sku" in change) next.unit = unitOf(next.sku) ?? next.unit;
    // A new sale prices itself from the product, the way the Home buttons do.
    if (next.type === "SALE" && next.amount == null && next.quantity) {
      const price = unitPrice(next.sku, next.priceType);
      if (price) next.amount = Math.round(price * next.quantity * 100) / 100;
    }
    setNewRow(next);
  }

  function saveNew() {
    if (newRow.amount == null && !newRow.sku) return;
    const typed = (newRow.counterparty ?? "").trim();
    // Same rule as the form: paying someone new puts them on the supplier list.
    if (newRow.type === "EXPENSE" && typed && !suppliers.some((s) => nameKey(s.name) === nameKey(typed))) {
      addSupplier({ name: typed, type: "raw_materials", items: "", lastPrice: 0, contact: "" });
    }
    addEntry(newRow);
    setNewRow(blankEntryDraft(defaultType, "Added in the table"));
    onDoneAdding();
  }

  function commitWho(entry: Entry, typed: string) {
    const name = typed.trim() || null;
    if (entry.type === "EXPENSE" && name && !suppliers.some((s) => nameKey(s.name) === nameKey(name))) {
      addSupplier({ name, type: "raw_materials", items: "", lastPrice: 0, contact: "" });
    }
    patch(entry, { counterparty: name });
  }

  /** Item, who and category are the same three dropdowns whether adding or editing. */
  function itemCell(value: string | null, onPick: (sku: string | null) => void) {
    return (
      <select className={CELL} value={value ?? ""} onChange={(e) => onPick(e.target.value || null)}>
        <option value="">—</option>
        {value && !itemNames.includes(value) && <option value={value}>{value}</option>}
        {itemNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    );
  }

  function categoryCell(
    type: EntryDraft["type"],
    category: ExpenseCategory | null,
    priceType: PriceType,
    onCategory: (c: ExpenseCategory) => void,
    onPriceType: (p: PriceType) => void,
  ) {
    return type === "EXPENSE" ? (
      <select className={CELL} value={category ?? "misc"} onChange={(e) => onCategory(e.target.value)}>
        {expenseCategories.map((c) => (
          <option key={c} value={c}>
            {EXPENSE_CATEGORY_LABELS[c] ?? c}
          </option>
        ))}
      </select>
    ) : (
      <select className={CELL} value={priceType ?? "standard"} onChange={(e) => onPriceType(e.target.value as PriceType)}>
        {(["standard", "friend", "wholesale"] as const).map((p) => (
          <option key={p} value={p}>
            {PRICE_TYPE_LABELS[p]}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="overflow-x-auto">
      <datalist id="grid-customers">
        {customerNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="grid-suppliers">
        {suppliers.map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>

      <div className="min-w-[860px]">
        <div className={`grid ${COLUMNS} gap-1 border-b border-line/15 bg-secondary px-2`}>
          {["Date", "Type", "Item", "Qty", "Customer / Supplier", "Category / price", "Amount", ""].map((h) => (
            <div
              key={h}
              className={`px-1 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground ${h === "Qty" || h === "Amount" ? "text-right" : ""}`}
            >
              {h}
            </div>
          ))}
        </div>

        {adding && (
          <div className={`grid ${COLUMNS} items-center gap-1 border-b border-cacao/30 bg-cacao/[0.04] px-2 py-1.5`}>
            <input
              type="date"
              className={CELL}
              value={isoDay(newRow.timestamp)}
              onChange={(e) => changeNew({ timestamp: withDate(newRow.timestamp, e.target.value) })}
            />
            <select
              className={CELL}
              value={newRow.type}
              onChange={(e) => changeNew({ type: e.target.value as "SALE" | "EXPENSE" })}
            >
              <option value="SALE">Sale</option>
              <option value="EXPENSE">Expense</option>
            </select>
            {itemCell(newRow.sku, (sku) => changeNew({ sku }))}
            <div className="flex items-center gap-1 pr-1">
              <CommitCell
                type="number"
                align="right"
                value={newRow.quantity == null ? "" : String(newRow.quantity)}
                onCommit={(v) => changeNew({ quantity: num(v) })}
              />
              <span className="shrink-0 text-[11px] text-muted-foreground">{unitOf(newRow.sku) ?? ""}</span>
            </div>
            <CommitCell
              value={newRow.counterparty ?? ""}
              list={newRow.type === "EXPENSE" ? "grid-suppliers" : "grid-customers"}
              placeholder={newRow.type === "EXPENSE" ? "Paid to" : "Buyer"}
              onCommit={(v) => changeNew({ counterparty: v.trim() || null })}
            />
            {categoryCell(
              newRow.type,
              newRow.category,
              newRow.priceType,
              (category) => changeNew({ category }),
              (priceType) => changeNew({ priceType }),
            )}
            <CommitCell
              type="number"
              align="right"
              value={newRow.amount == null ? "" : String(newRow.amount)}
              onCommit={(v) => changeNew({ amount: num(v) })}
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Add this row"
                onClick={saveNew}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cacao text-ivory"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Discard this row"
                onClick={() => {
                  setNewRow(blankEntryDraft(defaultType, "Added in the table"));
                  onDoneAdding();
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {rows.length === 0 && !adding && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No transactions match.</div>
        )}

        {rows.map((e, i) => (
          <div
            key={e.id}
            className={`grid ${COLUMNS} items-center gap-1 border-b border-line/5 px-2 py-1.5 ${i % 2 === 0 ? "bg-white" : "bg-[#FBFAF7]"}`}
          >
            <input
              type="date"
              className={CELL}
              value={isoDay(e.timestamp)}
              onChange={(ev) => ev.target.value && patch(e, { timestamp: withDate(e.timestamp, ev.target.value) })}
            />
            <select
              className={`${CELL} font-semibold ${e.type === "SALE" ? "text-success" : "text-danger"}`}
              value={e.type}
              onChange={(ev) => patch(e, { type: ev.target.value as "SALE" | "EXPENSE" })}
            >
              <option value="SALE">Sale</option>
              <option value="EXPENSE">Expense</option>
            </select>
            {itemCell(e.sku, (sku) => patch(e, { sku }))}
            <div className="flex items-center gap-1 pr-1">
              <CommitCell
                type="number"
                align="right"
                value={e.quantity == null ? "" : String(e.quantity)}
                onCommit={(v) => patch(e, { quantity: num(v) })}
              />
              <span className="shrink-0 text-[11px] text-muted-foreground">{e.unit ?? unitOf(e.sku) ?? ""}</span>
            </div>
            <CommitCell
              value={e.counterparty ?? ""}
              list={e.type === "EXPENSE" ? "grid-suppliers" : "grid-customers"}
              onCommit={(v) => commitWho(e, v)}
            />
            {categoryCell(
              e.type,
              e.category,
              e.priceType,
              (category) => patch(e, { category }),
              (priceType) => patch(e, { priceType }),
            )}
            <CommitCell
              type="number"
              align="right"
              value={e.amount == null ? "" : String(e.amount)}
              onCommit={(v) => patch(e, { amount: num(v) })}
            />
            <ConfirmDelete onConfirm={() => deleteEntry(e.id)} />
          </div>
        ))}

        {!adding && (
          <button
            type="button"
            onClick={onStartAdding}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-semibold text-cacao transition-colors hover:bg-cacao/[0.06]"
          >
            <Plus className="h-4 w-4" /> Add a row
          </button>
        )}
      </div>
    </div>
  );
}

/** Two taps to delete a row, so a stray click in a grid of inputs can't erase a sale. */
function ConfirmDelete({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      title={armed ? "Tap again to delete" : "Delete this row"}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
        armed ? "bg-danger text-white" : "text-muted-foreground hover:bg-danger/10 hover:text-danger"
      }`}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/** Shown under the grid, so the totals of what's on screen are always in view. */
export function GridFooterTotals({ rows }: { rows: Entry[] }) {
  const money = rows.reduce((sum, e) => sum + (e.type === "SALE" ? (e.amount ?? 0) : -(e.amount ?? 0)), 0);
  return <span className="font-semibold">{formatPeso(money)}</span>;
}
