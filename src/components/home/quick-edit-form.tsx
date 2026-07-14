"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store/use-store";
import { EXPENSE_CATEGORY_LABELS, ENTRY_TYPE_LABELS, PRICE_TYPE_LABELS } from "@/lib/format";
import type { EntryDraft } from "@/lib/home/describe-entry";
import type { EntryType, ExpenseCategory, PriceType } from "@/lib/store/types";
import { cn } from "@/lib/utils";

const ENTRY_TYPES = Object.keys(ENTRY_TYPE_LABELS) as EntryType[];
const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];
const PRICE_TYPES: Exclude<PriceType, null>[] = ["standard", "friend", "wholesale"];

function ChipGroup<T extends string>({
  options,
  value,
  labels,
  onChange,
}: {
  options: T[];
  value: T;
  labels: Record<string, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium",
            value === opt
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-foreground",
          )}
        >
          {labels[opt] ?? opt}
        </button>
      ))}
    </div>
  );
}

export function QuickEditForm({
  initial,
  onSave,
  onCancel,
  lockType = false,
  allowedTypes,
  className,
}: {
  initial: EntryDraft;
  onSave: (draft: EntryDraft) => void;
  onCancel: () => void;
  /** Hide the "This was a..." type picker entirely — used when the form is already scoped to one type. */
  lockType?: boolean;
  /** Restrict the type picker to a subset (e.g. Stock's manual entry only offers Batch made / Waste / Stock out). */
  allowedTypes?: EntryType[];
  /** Overrides the default chat-bubble width — pass "max-w-none" when this fills a full-width page column. */
  className?: string;
}) {
  const { products, rawMaterials } = useStore();
  const [draft, setDraft] = useState<EntryDraft>(initial);
  // Buffered as text, not the parsed number, so typing a decimal point doesn't get
  // silently eaten (Number("12.") rounds to 12, so re-deriving the field from
  // draft.amount on every keystroke would make "12.50" collapse to "1250").
  const [amountText, setAmountText] = useState(initial.amount == null ? "" : String(initial.amount));
  const [quantityText, setQuantityText] = useState(initial.quantity == null ? "" : String(initial.quantity));

  function set<K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const skuOptions = [...products.map((p) => p.name), ...rawMaterials.map((m) => m.name)];
  const typeOptions = allowedTypes ?? ENTRY_TYPES;

  return (
    <div className={cn("w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-3", className)}>
      {!lockType && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">This was a...</Label>
          <ChipGroup options={typeOptions} value={draft.type} labels={ENTRY_TYPE_LABELS} onChange={(v) => set("type", v)} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Amount (₱)</Label>
          <Input
            type="number"
            inputMode="decimal"
            className="h-9"
            value={amountText}
            onChange={(e) => {
              setAmountText(e.target.value);
              set("amount", e.target.value === "" ? null : Number(e.target.value));
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Quantity</Label>
          <Input
            type="number"
            inputMode="decimal"
            className="h-9"
            value={quantityText}
            onChange={(e) => {
              setQuantityText(e.target.value);
              set("quantity", e.target.value === "" ? null : Number(e.target.value));
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Unit</Label>
          <Input
            className="h-9"
            value={draft.unit ?? ""}
            onChange={(e) => set("unit", e.target.value || null)}
            placeholder="jars, kg..."
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Product / item</Label>
          <Input
            className="h-9"
            list="quick-edit-sku-options"
            value={draft.sku ?? ""}
            onChange={(e) => set("sku", e.target.value || null)}
          />
          <datalist id="quick-edit-sku-options">
            {skuOptions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Buyer / supplier</Label>
        <Input
          className="h-9"
          value={draft.counterparty ?? ""}
          onChange={(e) => set("counterparty", e.target.value || null)}
        />
      </div>

      {draft.type === "SALE" && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Price type</Label>
          <ChipGroup
            options={PRICE_TYPES}
            value={draft.priceType ?? "standard"}
            labels={PRICE_TYPE_LABELS}
            onChange={(v) => set("priceType", v)}
          />
        </div>
      )}

      {draft.type === "EXPENSE" && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <ChipGroup
            options={EXPENSE_CATEGORIES}
            value={draft.category ?? "misc"}
            labels={EXPENSE_CATEGORY_LABELS}
            onChange={(v) => set("category", v)}
          />
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" className="flex-1" onClick={() => onSave(draft)}>
          Save
        </Button>
        <Button size="sm" variant="ghost" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
