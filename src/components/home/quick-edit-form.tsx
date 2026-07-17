"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { useStore } from "@/lib/store/use-store";
import { EXPENSE_CATEGORY_LABELS, ENTRY_TYPE_LABELS, PRICE_TYPE_LABELS } from "@/lib/format";
import { allExpenseCategories } from "@/lib/summary/expenses-summary";
import type { EntryDraft } from "@/lib/home/describe-entry";
import type { EntryType, PriceType } from "@/lib/store/types";
import { cn } from "@/lib/utils";

const ENTRY_TYPES = Object.keys(ENTRY_TYPE_LABELS) as EntryType[];
const PRICE_TYPES: Exclude<PriceType, null>[] = ["standard", "friend", "wholesale"];

/** Strips anything but digits and a single decimal point — typed or pasted. */
function sanitizeAmountText(raw: string): string {
  const digitsAndDots = raw.replace(/[^0-9.]/g, "");
  const firstDot = digitsAndDots.indexOf(".");
  if (firstDot === -1) return digitsAndDots;
  return digitsAndDots.slice(0, firstDot + 1) + digitsAndDots.slice(firstDot + 1).replace(/\./g, "");
}

export function QuickEditForm({
  initial,
  onSave,
  onCancel,
  onDelete,
  lockType = false,
  allowedTypes,
  className,
}: {
  initial: EntryDraft;
  onSave: (draft: EntryDraft) => void;
  onCancel: () => void;
  /** Shows a delete button next to Save/Cancel — pass only when editing an entry that already exists. */
  onDelete?: () => void;
  /** Hide the "This was a..." type picker entirely — used when the form is already scoped to one type. */
  lockType?: boolean;
  /** Restrict the type picker to a subset (e.g. Stock's manual entry only offers Batch made / Waste / Stock out). */
  allowedTypes?: EntryType[];
  /** Overrides the default chat-bubble width — pass "max-w-none" when this fills a full-width page column. */
  className?: string;
}) {
  const { products, rawMaterials, categoryBudgets } = useStore();
  const [draft, setDraft] = useState<EntryDraft>(initial);
  // Buffered as text, not the parsed number, so typing a decimal point doesn't get
  // silently eaten (Number("12.") rounds to 12, so re-deriving the field from
  // draft.amount on every keystroke would make "12.50" collapse to "1250").
  const [amountText, setAmountText] = useState(initial.amount == null ? "" : String(initial.amount));
  const [quantityText, setQuantityText] = useState(initial.quantity == null ? "" : String(initial.quantity));

  function set<K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const skuOptions = Array.from(
    new Set([...(draft.sku ? [draft.sku] : []), ...products.map((p) => p.name), ...rawMaterials.map((m) => m.name)]),
  );
  const typeOptions = allowedTypes ?? ENTRY_TYPES;
  const expenseCategories = allExpenseCategories(categoryBudgets);

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
              const clean = sanitizeAmountText(e.target.value);
              setAmountText(clean);
              set("amount", clean === "" ? null : Number(clean));
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
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            value={draft.sku ?? ""}
            onChange={(e) => set("sku", e.target.value || null)}
          >
            <option value="">Select…</option>
            {skuOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Buyer</Label>
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
            options={expenseCategories}
            value={draft.category ?? "misc"}
            labels={EXPENSE_CATEGORY_LABELS}
            onChange={(v) => set("category", v)}
          />
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        {onDelete && <ConfirmDeleteButton onConfirm={onDelete} />}
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
