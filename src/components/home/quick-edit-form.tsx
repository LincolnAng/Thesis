"use client";

import { useState } from "react";
import { addProduct, addSupplier } from "@/lib/store/store";
import { nameKey } from "@/lib/summary/name-match";
import { blankProduct } from "@/lib/store/blank-product";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { UnitSelect } from "@/components/ui/unit-select";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { CustomerNameInput } from "@/components/customers/customer-name-input";
import { SupplierNameInput } from "@/components/suppliers/supplier-name-input";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { useStore } from "@/lib/store/use-store";
import { EXPENSE_CATEGORY_LABELS, ENTRY_TYPE_LABELS, PRICE_TYPE_LABELS, formatPeso } from "@/lib/format";
import { itemChoices, productForItem, selectedItemValue, unitForItem } from "@/lib/summary/item-catalog";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { allExpenseCategories } from "@/lib/summary/expenses-summary";
import type { EntryDraft } from "@/lib/home/describe-entry";
import type { EntryType, PriceType, Product } from "@/lib/store/types";
import type { CostContext } from "@/lib/summary/recipe-cost";
import { cn } from "@/lib/utils";

const ENTRY_TYPES = Object.keys(ENTRY_TYPE_LABELS) as EntryType[];
const PRICE_TYPES: Exclude<PriceType, null>[] = ["standard", "friend", "wholesale"];

/** What one of this product sells for right now, at the price type on the draft. */
function unitPriceFor(d: EntryDraft, products: Product[], ctx: CostContext): number | null {
  const product = productForItem(d.sku, products);
  if (!product) return null;
  if (d.priceType === "friend" && product.friendPrice > 0) return product.friendPrice;
  if (d.priceType === "wholesale" && product.wholesalePrice > 0) return product.wholesalePrice;
  const price = effectiveProductPrice(product, productCostPerJar(product, ctx));
  return price > 0 ? price : null;
}

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
  wide = false,
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
  /** Lays the fields out across the page instead of down a column — for editing a row in
   * place, where a tall stacked form would push the rest of the table off the screen. */
  wide?: boolean;
}) {
  const { products, rawMaterials, categoryBudgets, events, suppliers } = useStore();
  const costCtx = useCostContext();
  // A form opened with a product and a quantity already on it (Home's "Something sold")
  // should show the money straight away, not wait for something to be touched.
  const seedPrice =
    initial.amount == null && initial.type === "SALE" && initial.quantity
      ? unitPriceFor(initial, products, costCtx)
      : null;
  const seeded: EntryDraft =
    seedPrice && initial.quantity
      ? { ...initial, amount: Math.round(seedPrice * initial.quantity * 100) / 100 }
      : initial;
  const [draft, setDraft] = useState<EntryDraft>(seeded);
  // Buffered as text, not the parsed number, so typing a decimal point doesn't get
  // silently eaten (Number("12.") rounds to 12, so re-deriving the field from
  // draft.amount on every keystroke would make "12.50" collapse to "1250").
  const [amountText, setAmountText] = useState(seeded.amount == null ? "" : String(seeded.amount));
  const [amountInvalid, setAmountInvalid] = useState(false);
  // Once the amount has been typed by hand it is never recalculated underneath them — a sale
  // at a price that isn't the list price is exactly the case worth not overwriting.
  const [amountTyped, setAmountTyped] = useState(initial.amount != null);
  const [autoFilledFrom, setAutoFilledFrom] = useState<number | null>(seedPrice);
  const [addingProduct, setAddingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");

  function set<K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // A sale has to name a product or it can't come off stock, can't reach best sellers, and
  // shows up in Customers as "Unspecified item".
  const productRequired = draft.type === "SALE";
  const missingProduct = productRequired && !draft.sku;

  function createProduct(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    addProduct(blankProduct(trimmed));
    set("sku", trimmed);
    setAddingProduct(false);
    setNewProductName("");
  }

  /**
   * An expense paid to a name nobody has used before registers that name as a supplier, the
   * same way a sale to a new buyer creates a customer. Type and items are left for the
   * Suppliers page — what matters here is that the spending has something to group under
   * instead of sitting in free text.
   */
  function registerNewSupplier(draftToSave: EntryDraft) {
    if (draftToSave.type !== "EXPENSE") return;
    const typed = (draftToSave.counterparty ?? "").trim();
    if (!typed) return;
    if (suppliers.some((s) => nameKey(s.name) === nameKey(typed))) return;
    addSupplier({ name: typed, type: "raw_materials", items: "", lastPrice: 0, contact: "" });
  }

  // Grouped and labelled rather than one flat list, and a sale can only be a product —
  // the Products tab is the catalog of record. See lib/summary/item-catalog.
  const choices = itemChoices(draft.type, products, rawMaterials, draft.sku);

  /** The unit the catalog already knows for an item, so it's never asked for per transaction. */
  function unitOfItem(name: string | null): string | null {
    return unitForItem(name, products, rawMaterials);
  }

  /**
   * Changes a field and, for a sale, works the money out from the product's own price —
   * the owner picks what and how many, and the peso figure fills itself in. Anything typed
   * into the amount box turns this off for the rest of the form.
   */
  function change(patch: Partial<EntryDraft>) {
    const next = { ...draft, ...patch };
    if (!amountTyped && next.type === "SALE") {
      const unitPrice = unitPriceFor(next, products, costCtx);
      if (unitPrice && next.quantity && next.quantity > 0) {
        next.amount = Math.round(unitPrice * next.quantity * 100) / 100;
        setAmountText(String(next.amount));
        setAutoFilledFrom(unitPrice);
      }
    }
    setDraft(next);
  }

  const itemUnit = unitOfItem(draft.sku);
  // Shown above the amount once there's more than one of something: a ₱1,800 line for 10
  // jars is only checkable against ₱180 a jar, which is the number the owner actually knows.
  const perPiece =
    (draft.type === "SALE" || draft.type === "EXPENSE") && draft.amount && (draft.quantity ?? 0) > 1
      ? draft.amount / (draft.quantity as number)
      : null;
  const typeOptions = allowedTypes ?? ENTRY_TYPES;
  const expenseCategories = allExpenseCategories(categoryBudgets);
  // Only stock-moving entries can belong to an event, and only somewhere still running —
  // plus whichever event this entry is already tagged to, so editing an old one still shows it.
  const canTagEvent = draft.type === "SALE" || draft.type === "WASTE" || draft.type === "INVENTORY_OUT";
  const eventOptions = events.filter((e) => e.status === "open" || e.id === draft.eventId);

  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-border bg-card p-3",
        wide ? "grid grid-cols-2 items-start gap-3 min-[1100px]:grid-cols-4" : "max-w-sm space-y-3",
        className,
      )}
    >
      {!lockType && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">This was a...</Label>
          <ChipGroup options={typeOptions} value={draft.type} labels={ENTRY_TYPE_LABELS} onChange={(v) => set("type", v)} />
        </div>
      )}

      {/* What, then how many, then how much — picking the item first is what makes the unit
          something nobody has to type: it comes from the product's own settings. Laid out
          wide, these three stop being a group and join the row like every other field. */}
      <div className={wide ? "contents" : "space-y-2"}>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Product / item{productRequired && <span className="text-destructive"> *</span>}
          </Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            aria-invalid={missingProduct}
            value={selectedItemValue(draft.sku, choices)}
            onChange={(e) => {
              if (e.target.value === "__new__") {
                setAddingProduct(true);
                return;
              }
              const name = e.target.value || null;
              change({ sku: name, unit: unitOfItem(name) ?? draft.unit });
            }}
          >
            <option value="">Select…</option>
            {choices.unknown && <option value={choices.unknown}>{choices.unknown} (not in Products)</option>}
            {choices.products.length > 0 && (
              <optgroup label="Products">
                {choices.products.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            )}
            {choices.materials.length > 0 && (
              <optgroup label="Materials">
                {choices.materials.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="__new__">+ Add a new product…</option>
          </select>
        </div>

        {/* Both halves are always here, whether or not an item has been picked, so the form
            doesn't rearrange itself underneath whoever is filling it in. The unit half is a
            question only for something not in the catalog; for a known item it states the
            answer the catalog already holds. */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">How many</Label>
            <QuantityStepper value={draft.quantity} onChange={(quantity) => change({ quantity })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Measured in</Label>
            {itemUnit ? (
              <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-secondary/50 px-2.5">
                <span className="truncate text-sm font-semibold text-foreground">{itemUnit}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">from Settings</span>
              </div>
            ) : (
              <UnitSelect value={draft.unit ?? null} onChange={(unit) => set("unit", unit)} emptyLabel="Pick a unit" />
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <Label className="text-xs text-muted-foreground">Amount (₱)</Label>
            {perPiece !== null && (
              <span className="text-[11px] italic text-muted-foreground">
                price per piece: {formatPeso(perPiece)}
              </span>
            )}
          </div>
          <Input
            type="number"
            inputMode="decimal"
            className="h-9"
            aria-invalid={amountInvalid}
            value={amountText}
            onChange={(e) => {
              const raw = e.target.value;
              const clean = sanitizeAmountText(raw);
              setAmountText(clean);
              set("amount", clean === "" ? null : Number(clean));
              setAmountInvalid(raw !== clean);
              setAmountTyped(true);
              setAutoFilledFrom(null);
            }}
          />
          {amountInvalid && <p className="text-xs text-destructive">Numbers only</p>}
          {!amountInvalid && autoFilledFrom !== null && (
            <p className="text-xs text-muted-foreground">
              Worked out from {formatPeso(autoFilledFrom)} each — type over it if this one was different.
            </p>
          )}
        </div>
      </div>

      {addingProduct && (
        <div className="space-y-1.5 rounded-xl border border-border p-2.5">
          <Label className="text-xs text-muted-foreground">New product name</Label>
          <Input
            autoFocus
            className="h-9"
            placeholder="e.g. Ice Chocolate"
            value={newProductName}
            onChange={(e) => setNewProductName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createProduct(newProductName)}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={!newProductName.trim()} onClick={() => createProduct(newProductName)}>
              Add product
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAddingProduct(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {missingProduct && (
        <p className="text-xs text-destructive">
          Pick a product so this sale comes off your stock and shows in your best sellers.
        </p>
      )}

      {draft.type === "EXPENSE" ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Paid to</Label>
          <SupplierNameInput value={draft.counterparty ?? null} onChange={(name) => set("counterparty", name)} />
        </div>
      ) : (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Buyer</Label>
          <CustomerNameInput value={draft.counterparty ?? null} onChange={(name) => set("counterparty", name)} />
        </div>
      )}

      {canTagEvent && eventOptions.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Where did this happen?</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            value={draft.eventId ?? ""}
            onChange={(e) => set("eventId", e.target.value || null)}
          >
            <option value="">Normal business</option>
            {eventOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {draft.eventId && (
            <p className="text-xs text-muted-foreground">
              This comes out of what that place is holding, not your main stock.
            </p>
          )}
        </div>
      )}

      {draft.type === "SALE" && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Price type</Label>
          <ChipGroup
            options={PRICE_TYPES}
            value={draft.priceType ?? "standard"}
            labels={PRICE_TYPE_LABELS}
            onChange={(v) => change({ priceType: v })}
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

      <div className={cn("flex items-center gap-2 pt-1", wide && "col-span-full")}>
        {onDelete && <ConfirmDeleteButton onConfirm={onDelete} />}
        <Button
          size="sm"
          className={wide ? "px-8" : "flex-1"}
          disabled={missingProduct}
          onClick={() => {
            const saved = { ...draft, unit: itemUnit ?? draft.unit };
            registerNewSupplier(saved);
            onSave(saved);
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" className={wide ? "px-6" : "flex-1"} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
