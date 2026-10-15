"use client";

import { EMPLOYEE_ENTRY_TYPES, PAYROLL_CATEGORIES } from "@/lib/auth/permissions";
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
import { EXPENSE_CATEGORY_LABELS, ENTRY_TYPE_LABELS, INVESTMENT_CATEGORIES, PRICE_TYPE_LABELS, formatPeso } from "@/lib/format";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { MethodFields } from "@/components/transactions/method-fields";
import { PAYMENT_TERMS, dueFromTerms, paidSoFar, termsLabel, todayOf } from "@/lib/transactions/ledger";
import { spoiledValue } from "@/lib/summary/spoilage";
import { productUnit } from "@/lib/units";
import { bulkUnitFor } from "@/lib/summary/business-config";
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
  const product = products.find((p) => p.name === d.sku);
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
  const { products, rawMaterials, categoryBudgets, events, suppliers, businessSettings } = useStore();
  const costCtx = useCostContext();
  // Payment terms are the owners' to track; employees never see who owes what.
  const exec = isExecutive(useCurrentUser());
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
  // A sale the customer still owes for can be recorded before it is tied to a product — the
  // debt is real either way — but then no stock comes off the shelf.
  const productRequired = draft.type === "SALE" && draft.paymentTerm !== "receivable";
  const missingProduct = productRequired && !draft.sku;
  // Every sale names its buyer and every expense whom it was paid to.
  const missingParty = (draft.type === "SALE" || draft.type === "EXPENSE") && !(draft.counterparty ?? "").trim();
  // A bank transfer names its bank.
  const missingBank = draft.paymentMethod === "bank_transfer" && !(draft.bankName ?? "").trim();
  // What was already paid on something owed can't exceed it, and a transfer names its bank.
  const firstPaid = (draft.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
  const problem =
    firstPaid > (draft.amount ?? 0) + 0.005
      ? `What was already ${draft.type === "SALE" ? "received" : "paid"} can't be more than the total.`
      : draft.payments?.some((p) => p.method === "bank_transfer" && !p.bankName?.trim())
        ? "Name the bank that payment went through."
        : null;

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

  /**
   * Making, selling and moving stock are about FINISHED GOODS, and the Products tab is the only
   * list of those. The dropdown used to merge in every raw material, so "Made a batch" offered
   * jars, oil and mix-ins — things you buy, never things you make.
   *
   * Buying and spoilage keep both lists, because those genuinely happen to raw materials: she
   * buys beans, and beans go bad. An existing sku is always kept so editing an old entry can't
   * silently drop what it was about.
   */
  const materialsApply = draft.type === "EXPENSE" || draft.type === "RND" || draft.type === "WASTE";
  const skuOptions = Array.from(
    new Set([
      ...(draft.sku ? [draft.sku] : []),
      ...products.map((p) => p.name),
      ...(materialsApply ? rawMaterials.map((m) => m.name) : []),
    ]),
  );

  // Stock that spoiled or went to an event moves QUANTITY, not money, and has no counterparty.
  // Nothing in the app reads an amount off either one, so asking for it was asking her to type
  // a number into a hole. A batch she made has no buyer either.
  // Stock moved to an event is not money. Spoilage IS, once it is a finished jar — the value
  // is worked out rather than typed, so it is shown as a figure instead of an empty box.
  const movesMoney = draft.type !== "WASTE" && draft.type !== "INVENTORY_OUT";
  const spoilageLossValue = draft.type === "WASTE" ? draft.amount : null;
  const hasCounterparty = draft.type === "SALE" || draft.type === "EXPENSE" || draft.type === "RND";

  /** The unit the catalog already knows for an item, so it's never asked for per transaction. */
  function unitOfItem(name: string | null): string | null {
    if (!name) return null;
    const product = products.find((p) => p.name === name);
    if (product) return productUnit(product);
    return rawMaterials.find((m) => m.name === name)?.unit?.trim() || null;
  }

  /**
   * Changes a field and, for a sale, works the money out from the product's own price —
   * the owner picks what and how many, and the peso figure fills itself in. Anything typed
   * into the amount box turns this off for the rest of the form.
   */
  function change(patch: Partial<EntryDraft>) {
    const next = { ...draft, ...patch };

    // Fields that stop applying must stop being SAVED, not just stop being drawn. Filling in a
    // sale and then switching it to spoilage would otherwise keep the buyer and the peso figure
    // on the entry, invisibly — a record nobody typed and nobody can see to correct.
    if (next.type === "WASTE" || next.type === "INVENTORY_OUT") {
      next.counterparty = null;
      // A spoiled JAR is written off at what it cost to make; stock moved to an event and a
      // spoiled INGREDIENT are not — see summary/spoilage.ts. Logging the same loss from Home
      // and from Transactions has to produce the same record, or where she happened to be standing
      // decides whether it costs anything.
      next.amount = next.type === "WASTE" ? spoiledValue(next.sku, next.quantity, products, costCtx) : null;
      setAmountText(next.amount == null ? "" : String(next.amount));
      setAutoFilledFrom(null);
    } else if (next.type === "INVENTORY_IN") {
      next.counterparty = null;
    }
    // Only a sale can be owed TO the business and only an expense BY it. A term that stops
    // applying is cleared rather than left on the row where nobody can see it.
    const allowedTerm = next.type === "SALE" ? "receivable" : next.type === "EXPENSE" ? "payable" : null;
    if (next.paymentTerm && next.paymentTerm !== "spot" && next.paymentTerm !== allowedTerm) {
      next.paymentTerm = null;
      next.dueDate = null;
      next.amountPaid = null;
      next.paymentStatus = null;
      next.settledAt = null;
    }
    if (next.type === "RND" && !(INVESTMENT_CATEGORIES as readonly string[]).includes(next.category ?? "")) {
      next.category = "rnd";
    }

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
  /**
   * Counting this line in boxes instead of single jars.
   *
   * She almost never sells one jar at a time, but the shelf is counted in jars, so the box is
   * a way of typing — not a second kind of quantity. The saved number is always jars. Each
   * product brings its own box size and its own word for it, because a tray of one spread is
   * not a case of another.
   */
  const [bulk, setBulk] = useState(false);
  /**
   * Switching the unit rounds the draft to whole ones of it.
   *
   * Flipping "1 jar" to boxes otherwise reads "0.04 cases", and she has to clear the field
   * before she can type. Nobody sells a twenty-fifth of a case, so the switch is taken as a
   * statement of how this sale is being counted — and the number visibly changes, so nothing
   * is decided behind her back.
   */
  function switchBulk(on: boolean) {
    setBulk(on);
    const product = products.find((p) => p.name === draft.sku);
    if (!product || draft.quantity == null) return;
    const { size } = bulkUnitFor(businessSettings, product);
    const whole = on ? Math.max(1, Math.round(draft.quantity / size)) * size : Math.round(draft.quantity);
    if (whole !== draft.quantity) change({ quantity: whole });
  }
  const bulkProduct = products.find((p) => p.name === draft.sku);
  const bulkUnit = bulkUnitFor(businessSettings, bulkProduct);
  const inBulk = bulk && bulkProduct != null;
  // Shown above the amount once there's more than one of something: a ₱1,800 line for 10
  // jars is only checkable against ₱180 a jar, which is the number the owner actually knows.
  const perPiece =
    (draft.type === "SALE" || draft.type === "EXPENSE") && draft.amount && (draft.quantity ?? 0) > 1
      ? draft.amount / (draft.quantity as number)
      : null;
  // An employee records sales, everyday expenses, spoilage and stock — never investments or
  // salaries — so those aren't offered (the server refuses them anyway).
  const typeOptions = (allowedTypes ?? ENTRY_TYPES).filter((t) => exec || EMPLOYEE_ENTRY_TYPES.includes(t));
  const expenseCategories = allExpenseCategories(categoryBudgets).filter((c) => exec || !PAYROLL_CATEGORIES.has(c.toLowerCase()));
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
            value={draft.sku ?? ""}
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
            {skuOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
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
            <QuantityStepper
              value={
                draft.quantity == null
                  ? null
                  : inBulk
                    ? Math.round((draft.quantity / bulkUnit.size) * 100) / 100
                    : draft.quantity
              }
              onChange={(typed) =>
                change({ quantity: typed == null ? null : inBulk ? typed * bulkUnit.size : typed })
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Measured in</Label>
            {bulkProduct ? (
              /* Two taps, not a dropdown: there are only ever two answers for a product, and
                 the box one says its size so nobody has to remember it. */
              <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-input text-xs">
                {[
                  { on: false, label: itemUnit ?? "each", hint: "" },
                  { on: true, label: `${bulkUnit.word}s`, hint: `of ${bulkUnit.size}` },
                ].map((choice) => (
                  <button
                    key={String(choice.on)}
                    type="button"
                    onClick={() => switchBulk(choice.on)}
                    className={cn(
                      "flex min-w-0 flex-1 items-center justify-center gap-1 px-1 transition-colors",
                      choice.on && "border-l border-input",
                      inBulk === choice.on
                        ? "bg-cacao/10 font-semibold text-cacao"
                        : "text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    <span className="truncate">{choice.label}</span>
                    {choice.hint && <span className="shrink-0 text-[10px] opacity-70">{choice.hint}</span>}
                  </button>
                ))}
              </div>
            ) : itemUnit ? (
              <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-secondary/50 px-2.5">
                <span className="truncate text-sm font-semibold text-foreground">{itemUnit}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">from Settings</span>
              </div>
            ) : (
              <UnitSelect value={draft.unit ?? null} onChange={(unit) => set("unit", unit)} emptyLabel="Pick a unit" />
            )}
          </div>
        </div>

        {draft.type === "WASTE" && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Value of what was lost</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-secondary/50 px-2.5 text-sm">
              {spoilageLossValue ? (
                <span className="font-semibold text-danger">{`−${formatPeso(spoilageLossValue)}`}</span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Worked out from what the jar costs — ingredients are written off a different way.
                </span>
              )}
            </div>
          </div>
        )}

        {movesMoney && (
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
        )}
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

      {hasCounterparty &&
        (draft.type === "EXPENSE" || draft.type === "RND" ? (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Paid to{draft.type === "EXPENSE" && <span className="text-destructive"> *</span>}
            </Label>
            <SupplierNameInput value={draft.counterparty ?? null} onChange={(name) => set("counterparty", name)} />
            {missingParty && <p className="text-xs text-destructive">Enter who was paid.</p>}
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Buyer name{draft.type === "SALE" && <span className="text-destructive"> *</span>}
            </Label>
            <CustomerNameInput value={draft.counterparty ?? null} onChange={(name) => set("counterparty", name)} />
            {missingParty && <p className="text-xs text-destructive">Enter the buyer&apos;s name.</p>}
          </div>
        ))}

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

      {draft.type === "RND" && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">What kind of investment</Label>
          <ChipGroup
            options={[...INVESTMENT_CATEGORIES]}
            value={(INVESTMENT_CATEGORIES as readonly string[]).includes(draft.category ?? "") ? (draft.category as string) : "rnd"}
            labels={EXPENSE_CATEGORY_LABELS}
            onChange={(v) => set("category", v)}
          />
          <p className="text-xs text-muted-foreground">Funded by the owners — kept apart from the business&apos;s money in and out.</p>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Date</Label>
        <Input
          type="date"
          value={dayOf(draft.timestamp)}
          onChange={(e) => e.target.value && set("timestamp", withDay(draft.timestamp, e.target.value))}
          className="h-9"
        />
      </div>

      {(draft.type === "SALE" || draft.type === "EXPENSE") && (
        <PaymentFields draft={draft} canOweLater={exec} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      )}
      {problem && <p className="text-xs font-medium text-danger">{problem}</p>}

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
          disabled={missingProduct || missingParty || missingBank || !!problem}
          onClick={() => {
            const saved = normalizePayment({ ...draft, unit: itemUnit ?? draft.unit });
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

/**
 * Makes the stored summary of an obligation agree with its payments before it is saved: what has
 * been paid, whether that settles it, and nothing at all for a spot sale or expense.
 */
function normalizePayment(d: EntryDraft): EntryDraft {
  const owed = (d.type === "SALE" && d.paymentTerm === "receivable") || (d.type === "EXPENSE" && d.paymentTerm === "payable");
  if (!owed) {
    return { ...d, paymentTerm: d.paymentTerm === "spot" ? "spot" : null, paymentTerms: null, dueDate: null, payments: null, amountPaid: null, paymentStatus: null, settledAt: null };
  }
  const paid = Math.round((d.payments ?? []).reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const settled = paid > 0 && paid >= (d.amount ?? 0) - 0.005;
  return {
    ...d,
    paymentMethod: null,
    bankName: null,
    amountPaid: paid > 0 ? paid : null,
    paymentStatus: settled ? "settled" : paid > 0 ? "partial" : "pending",
    settledAt: settled ? (d.settledAt ?? new Date().toISOString()) : null,
  };
}

function dayOf(timestamp: string): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Moves an entry to another day, keeping its time so ordering within a day survives. */
function withDay(timestamp: string, day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(timestamp);
  return new Date(y, m - 1, d, t.getHours(), t.getMinutes(), t.getSeconds()).toISOString();
}

/**
 * Paid now, or owed: and for each, what the record needs. A sale or expense paid on the spot
 * says how (cash, or a named bank). One that is owed says when it is due; any part already
 * paid is entered here once, and every later payment is recorded from the Still Owed list,
 * where it is added to this obligation's history instead of making a second one.
 */
function PaymentFields({
  draft,
  onChange,
  canOweLater,
}: {
  draft: EntryDraft;
  onChange: (patch: Partial<EntryDraft>) => void;
  canOweLater: boolean;
}) {
  const owedTerm = draft.type === "SALE" ? "receivable" : "payable";
  const owed = draft.paymentTerm === owedTerm;
  const existingPayments = draft.payments ?? [];
  const alreadyRecorded = existingPayments.length > 0;
  const first = existingPayments[0];
  const [paidText, setPaidText] = useState(first ? String(first.amount) : "");

  const baseDay = dayOf(draft.timestamp);

  function chooseTerms(terms: string) {
    const implied = dueFromTerms(terms, baseDay);
    onChange({ paymentTerms: terms, dueDate: implied ?? (terms === draft.paymentTerms ? draft.dueDate : null) });
  }

  function setFirstPayment(text: string, method: string | null, bankName: string | null) {
    setPaidText(text);
    const n = Number(text.replace(/[^0-9.]/g, ""));
    if (!(n > 0)) return onChange({ payments: null, amountPaid: null, paymentStatus: null });
    onChange({
      payments: [
        {
          id: first?.id ?? `pay-new-${Math.random().toString(36).slice(2, 8)}`,
          date: todayOf(new Date()) < baseDay ? baseDay : todayOf(new Date()),
          amount: n,
          method,
          bankName: method === "bank_transfer" ? bankName : null,
          note: null,
        },
      ],
      amountPaid: n,
      paymentStatus: n >= (draft.amount ?? 0) ? "settled" : "partial",
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-line/15 p-2.5">
      <Label className="text-xs text-muted-foreground">Payment</Label>
      {(canOweLater || owed) && (
        <ChipGroup
          options={["spot", owedTerm]}
          value={owed ? owedTerm : "spot"}
          labels={{ spot: "Paid on the spot", receivable: "Customer will pay later", payable: "We'll pay later" }}
          onChange={(v) =>
            onChange(
              v === "spot"
                ? { paymentTerm: "spot", paymentTerms: null, dueDate: null, payments: null, amountPaid: null, paymentStatus: null, settledAt: null }
                : { paymentTerm: owedTerm, paymentMethod: null, bankName: null, paymentStatus: draft.paymentStatus ?? "pending" },
            )
          }
        />
      )}

      {!owed && (
        <MethodFields
          method={draft.paymentMethod ?? "cash"}
          bankName={draft.bankName ?? null}
          onChange={(n) => onChange({ paymentMethod: n.method === "bank_transfer" ? "bank_transfer" : "cash", bankName: n.method === "bank_transfer" ? n.bankName : null })}
        />
      )}

      {owed && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">When it is due</Label>
            <ChipGroup
              options={PAYMENT_TERMS.map(([k]) => k)}
              value={draft.paymentTerms ?? ""}
              labels={Object.fromEntries(PAYMENT_TERMS)}
              onChange={chooseTerms}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Due date{draft.paymentTerms && draft.paymentTerms !== "date" && draft.paymentTerms !== "custom" ? ` (${termsLabel(draft.paymentTerms).toLowerCase()})` : ""}
            </Label>
            <Input type="date" value={draft.dueDate ?? ""} onChange={(e) => onChange({ dueDate: e.target.value || null })} className="h-10" />
          </div>

          {alreadyRecorded && existingPayments.length > 1 ? (
            <p className="text-xs text-muted-foreground">
              {formatPeso(paidSoFar(draft))} has been paid so far. Add more from the Still Owed list.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Already {draft.type === "SALE" ? "received" : "paid"} (₱, if any)</Label>
                <Input
                  inputMode="decimal"
                  value={paidText}
                  placeholder="0"
                  onChange={(e) => setFirstPayment(e.target.value, first?.method ?? "cash", first?.bankName ?? null)}
                  className="h-10"
                />
              </div>
              {first && (
                <MethodFields
                  method={first.method}
                  bankName={first.bankName}
                  label="How was that paid?"
                  onChange={(n) => setFirstPayment(paidText, n.method, n.bankName)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
