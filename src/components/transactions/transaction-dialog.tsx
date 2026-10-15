"use client";

import { useMemo, useState } from "react";
import { Banknote, Check, CircleCheck, Clock, HandCoins, Heart, Boxes, Landmark, Minus, PackageX, Plus, Receipt, ShoppingBag, Tag, Wrench, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomerNameInput } from "@/components/customers/customer-name-input";
import { SupplierNameInput } from "@/components/suppliers/supplier-name-input";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { useStore } from "@/lib/store/use-store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import { spoiledValue } from "@/lib/summary/spoilage";
import { allExpenseCategories } from "@/lib/summary/expenses-summary";
import { fullName } from "@/lib/summary/product-sizes";
import { findProduct } from "@/lib/summary/product-match";
import { addPayment, outstanding, paidSoFar } from "@/lib/transactions/ledger";
import { describeOrder, lineSubtotal, orderQuantity, orderTotal } from "@/lib/transactions/order-lines";
import { COMMON_BANKS, EXPENSE_CATEGORY_LABELS, describePaymentMethod, formatPeso } from "@/lib/format";
import { PAYROLL_CATEGORIES } from "@/lib/auth/permissions";
import { currentUser } from "@/lib/auth/current-user";
import type { Entry, OrderLine, PaymentMethod, PriceType, Product } from "@/lib/store/types";
import type { EntryDraft } from "@/lib/home/describe-entry";

interface Choice<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

/** The big decisions: equal tiles, icon over label, one row. */
function Tiles<T extends string>({ choices, value, onChange, ariaLabel }: { choices: Choice<T>[]; value: T; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={ariaLabel}>
      {choices.map(({ value: v, label, icon: Icon }) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={`flex h-[68px] flex-col items-center justify-center gap-1 rounded-xl border text-[13px] font-semibold transition active:scale-[0.97] ${
              on ? "border-cacao bg-cacao text-ivory shadow-sm" : "border-line/20 bg-card hover:border-cacao/50 hover:bg-secondary/50"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.9} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** The short either/or choices: one connected bar of equal segments, icon beside the label. */
function Segmented<T extends string>({ choices, value, onChange, ariaLabel }: { choices: Choice<T>[]; value: T; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="flex w-full gap-1 rounded-xl bg-secondary p-1" role="radiogroup" aria-label={ariaLabel}>
      {choices.map(({ value: v, label, icon: Icon }) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-center text-[13px] font-semibold leading-tight transition active:scale-[0.97] ${
              on ? "bg-cacao text-ivory shadow-sm" : "text-muted-foreground hover:bg-card/70"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.9} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

const KIND_ICON: Record<Kind, LucideIcon> = { sale: ShoppingBag, expense: Receipt, investment: Landmark, spoilage: PackageX };
const PRICE_CHOICES: Choice<Exclude<PriceType, null>>[] = [
  { value: "standard", label: "Regular", icon: Tag },
  { value: "friend", label: "Friend", icon: Heart },
  { value: "wholesale", label: "Wholesale", icon: Boxes },
];
const METHOD_CHOICES: Choice<PaymentMethod>[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "bank_transfer", label: "Bank transfer", icon: Landmark },
];

/** A payment the ledger refused (more than is owed, a future date…), shown to the person as is. */
class PaymentRefused extends Error {}

/**
 * Add or change a transaction — one compact form, laid out by what kind of transaction it is:
 *
 *   Sale         tick the products in the order and how many of each; the total adds itself up
 *   Expense      what it was for, its category, how much, and whether it's paid yet
 *   Investment   money put in (capital) or something bought to keep (a long-term asset)
 *   Spoilage     what was lost and how many
 *
 * Paying later turns a sale into a receivable and an expense or asset into a payable; a bank
 * transfer asks which bank (only the bank — never an account). Choosing how something will be
 * paid never marks it paid: payments are recorded, with their date, when they happen — here,
 * under "Record a payment", when the transaction is opened again.
 *
 * Save checks the form, saves once, and closes. Cancel closes without saving, and asks first if
 * anything was typed.
 */

type Kind = "sale" | "expense" | "investment" | "spoilage";
type InvestmentKind = "capital" | "asset";
type When = "now" | "later";

const KIND_LABEL: Record<Kind, string> = { sale: "Sale", expense: "Expense", investment: "Investment", spoilage: "Spoilage" };

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** A date picked in the form, keeping the original time of day so ordering within a day holds. */
function stamp(day: string, original?: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = original ? new Date(original) : new Date();
  return new Date(y, m - 1, d, t.getHours(), t.getMinutes(), t.getSeconds()).toISOString();
}
const num = (raw: string) => {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function kindOf(e: Entry | null): Kind {
  if (!e) return "sale";
  if (e.type === "EXPENSE") return "expense";
  if (e.type === "CAPITAL" || e.type === "ASSET") return "investment";
  if (e.type === "WASTE") return "spoilage";
  return "sale";
}

interface Line {
  /** Product id, or a key for a line whose product no longer exists. */
  key: string;
  productId: string | null;
  name: string;
  qty: string;
  price: string;
}

/** An existing sale as order lines — its own lines, or its single product as one line. */
function linesOf(e: Entry | null, products: Product[]): Line[] {
  if (!e || e.type !== "SALE") return [];
  if (e.lineItems?.length) {
    return e.lineItems.map((l, i) => ({
      key: l.productId ?? `gone-${i}`,
      productId: l.productId,
      name: l.name,
      qty: String(l.quantity),
      price: String(l.unitPrice),
    }));
  }
  if (!e.sku) return [];
  const product = findProduct(products, e.sku);
  const qty = e.quantity && e.quantity > 0 ? e.quantity : 1;
  const unit = e.amount != null ? Math.round((e.amount / qty) * 100) / 100 : 0;
  return [{ key: product?.id ?? "gone-0", productId: product?.id ?? null, name: product ? fullName(product, products) : e.sku, qty: String(qty), price: String(unit) }];
}

export function TransactionDialog({
  open,
  onOpenChange,
  existing,
  exec,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The transaction being changed; null to add a new one. */
  existing: Entry | null;
  exec: boolean;
  onSave: (draft: EntryDraft) => void;
  onDelete?: () => void;
}) {
  const { products, categoryBudgets } = useStore();
  const costCtx = useCostContext();
  const e = existing;

  // --- form state -----------------------------------------------------------------------
  const [kind, setKind] = useState<Kind>(kindOf(e));
  const [invKind, setInvKind] = useState<InvestmentKind>(e?.type === "CAPITAL" ? "capital" : "asset");
  const [date, setDate] = useState(e ? dayOf(e.timestamp) : today());
  const [notes, setNotes] = useState(e?.notes ?? "");
  // Sale
  const [priceType, setPriceType] = useState<Exclude<PriceType, null>>(e?.priceType ?? "standard");
  const [lines, setLines] = useState<Line[]>(() => linesOf(e, products));
  const [customer, setCustomer] = useState<string | null>(e?.type === "SALE" ? e.counterparty : null);
  // Expense / asset / capital
  const [what, setWhat] = useState(e && e.type !== "SALE" && e.type !== "WASTE" && e.type !== "CAPITAL" ? (e.sku ?? "") : "");
  const [category, setCategory] = useState(e?.type === "EXPENSE" ? (e.category ?? "misc") : "misc");
  const [amount, setAmount] = useState(e && e.type !== "SALE" && e.type !== "WASTE" && e.amount != null ? String(e.amount) : "");
  const [party, setParty] = useState<string | null>(e && e.type !== "SALE" ? e.counterparty : null);
  // Spoilage
  const [lostProduct, setLostProduct] = useState(e?.type === "WASTE" ? (findProduct(products, e.sku)?.id ?? "") : "");
  const [lostQty, setLostQty] = useState(e?.type === "WASTE" && e.quantity ? String(e.quantity) : "");
  // Payment
  const [when, setWhen] = useState<When>(e && (e.paymentTerm === "receivable" || e.paymentTerm === "payable") ? "later" : "now");
  const [method, setMethod] = useState<PaymentMethod>(e?.paymentMethod ?? "cash");
  const [bank, setBank] = useState(e?.bankName ?? "");
  const [dueDate, setDueDate] = useState(e?.dueDate ?? "");
  const [defaulted, setDefaulted] = useState(e?.paymentStatus === "defaulted");
  // A payment made now, against something owed
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [payBank, setPayBank] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const kinds: Kind[] = exec ? ["sale", "expense", "investment", "spoilage"] : ["sale", "expense", "spoilage"];
  const owedKind = kind === "sale" || kind === "expense" || (kind === "investment" && invKind === "asset");
  const showPayment = exec && (owedKind || (kind === "investment" && invKind === "capital"));

  // --- products --------------------------------------------------------------------------
  const priceOf = (p: Product, type: Exclude<PriceType, null>) => {
    if (type === "friend" && p.friendPrice > 0) return p.friendPrice;
    if (type === "wholesale" && p.wholesalePrice > 0) return p.wholesalePrice;
    return effectiveProductPrice(p, productCostPerJar(p, costCtx));
  };
  const catalog = useMemo(
    () => [...products].map((p) => ({ product: p, name: fullName(p, products) })).sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );
  const lineFor = (id: string) => lines.find((l) => l.key === id);
  function toggle(p: Product) {
    setLines((prev) =>
      prev.some((l) => l.key === p.id)
        ? prev.filter((l) => l.key !== p.id)
        : [...prev, { key: p.id, productId: p.id, name: fullName(p, products), qty: "1", price: String(priceOf(p, priceType)) }],
    );
  }
  function patchLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function changePriceType(next: Exclude<PriceType, null>) {
    setPriceType(next);
    // The prices of products still in the catalog follow the price type; a price typed by hand
    // for this one customer is replaced too, since the price type was the point of the change.
    setLines((prev) =>
      prev.map((l) => {
        const p = l.productId ? products.find((x) => x.id === l.productId) : undefined;
        return p ? { ...l, price: String(priceOf(p, next)) } : l;
      }),
    );
  }
  const orderLines: OrderLine[] = lines.map((l) => ({ productId: l.productId, name: l.name, quantity: num(l.qty), unitPrice: num(l.price) }));
  const saleTotal = orderTotal(orderLines);

  const lostValue = (() => {
    const p = products.find((x) => x.id === lostProduct);
    return p ? spoiledValue(p.name, num(lostQty), products, costCtx) : null;
  })();

  // --- saving ----------------------------------------------------------------------------
  const snapshot = JSON.stringify([kind, invKind, date, notes, priceType, lines, customer, what, category, amount, party, lostProduct, lostQty, when, method, bank, dueDate, defaulted, payAmount]);
  const [initialSnapshot] = useState(snapshot);
  const dirty = snapshot !== initialSnapshot;

  function validate(): string | null {
    if (!date) return "Pick the date.";
    if (kind === "sale") {
      if (lines.length === 0) return "Tick at least one product.";
      if (orderLines.some((l) => !(l.quantity > 0))) return "Each ticked product needs a quantity above zero.";
      if (orderLines.some((l) => !(l.unitPrice >= 0))) return "Check the prices — they must be numbers.";
      if (!(customer ?? "").trim()) return "Enter the buyer's name.";
    }
    if (kind === "expense" && !what.trim()) return "Say what the expense was for.";
    if (kind === "expense" && !(party ?? "").trim()) return "Enter who was paid.";
    if (kind === "investment" && invKind === "asset" && !what.trim()) return "Name the asset — for example, Freezer.";
    if (kind === "investment" && invKind === "capital" && !(party ?? "").trim()) return "Who put the money in?";
    if ((kind === "expense" || kind === "investment") && !(num(amount) > 0)) return "Enter the amount in pesos.";
    if (kind === "spoilage") {
      if (!lostProduct) return "Pick what was lost.";
      if (!(num(lostQty) > 0)) return "How many were lost?";
    }
    if (showPayment && method === "bank_transfer" && !bank.trim()) return "Which bank? Pick or type the bank name.";
    if (payAmount && num(payAmount) > 0 && payMethod === "bank_transfer" && !payBank.trim()) return "Which bank was the payment sent through?";
    return null;
  }

  function build(): EntryDraft {
    const base: EntryDraft = e
      ? (() => {
          const { id: _id, ...rest } = e;
          void _id;
          return rest;
        })()
      : {
          timestamp: "",
          type: "SALE",
          amount: null,
          quantity: null,
          unit: null,
          sku: null,
          counterparty: null,
          location: null,
          priceType: null,
          category: null,
          rawText: "Manual entry",
          confidence: 1,
          notes: null,
        };
    const d: EntryDraft = { ...base, timestamp: stamp(date, e?.timestamp), notes: notes.trim() || null };

    if (kind === "sale") {
      Object.assign(d, {
        type: "SALE",
        priceType,
        category: null,
        counterparty: customer?.trim() || null,
        amount: saleTotal,
        quantity: orderQuantity(orderLines),
        unit: orderLines.length === 1 ? (products.find((p) => p.id === orderLines[0].productId)?.unit ?? null) : null,
        sku: orderLines.length === 1 ? orderLines[0].name : describeOrder(orderLines),
        lineItems: orderLines,
      });
    } else if (kind === "expense") {
      Object.assign(d, { type: "EXPENSE", sku: what.trim(), category, amount: num(amount), quantity: null, unit: null, counterparty: party?.trim() || null, priceType: null, lineItems: null });
    } else if (kind === "investment" && invKind === "capital") {
      Object.assign(d, { type: "CAPITAL", sku: "Capital put in", category: null, amount: num(amount), quantity: null, unit: null, counterparty: party?.trim() || null, priceType: null, lineItems: null });
    } else if (kind === "investment") {
      Object.assign(d, { type: "ASSET", sku: what.trim(), category: null, amount: num(amount), quantity: null, unit: null, counterparty: party?.trim() || null, priceType: null, lineItems: null });
    } else {
      const p = products.find((x) => x.id === lostProduct);
      Object.assign(d, {
        type: "WASTE",
        sku: p?.name ?? null,
        quantity: num(lostQty),
        unit: p?.unit ?? null,
        amount: exec ? lostValue : (e?.amount ?? null),
        category: null,
        priceType: null,
        counterparty: null,
        lineItems: null,
      });
    }

    if (!showPayment) {
      // Employees never see payment terms; the server keeps the real ones on an edit.
      if (!exec) return d;
      Object.assign(d, { paymentTerm: null, dueDate: null, amountPaid: null, paymentStatus: null, settledAt: null, paymentMethod: null, bankName: null, payments: null });
      return d;
    }

    const bankName = method === "bank_transfer" ? bank.trim() || null : null;
    if (kind === "investment" && invKind === "capital") {
      // Capital is recorded when the money arrives, so it is always received in full.
      Object.assign(d, { paymentTerm: null, dueDate: null, amountPaid: null, paymentStatus: null, settledAt: null, paymentMethod: method, bankName, payments: null });
      return d;
    }
    if (when === "now") {
      Object.assign(d, { paymentTerm: "spot", dueDate: null, amountPaid: null, paymentStatus: null, settledAt: null, paymentMethod: method, bankName, payments: null });
    } else {
      const term = kind === "sale" ? "receivable" : "payable";
      const wasOwed = e?.paymentTerm === term;
      Object.assign(d, {
        paymentTerm: term,
        dueDate: dueDate || null,
        paymentMethod: method,
        bankName,
        payments: wasOwed ? (e?.payments ?? null) : null,
        amountPaid: wasOwed ? (e?.amountPaid ?? null) : null,
        paymentStatus: wasOwed ? (e?.paymentStatus === "defaulted" ? null : (e?.paymentStatus ?? null)) : null,
        settledAt: wasOwed ? (e?.settledAt ?? null) : null,
      });
      const pay = num(payAmount);
      if (pay > 0) {
        const who = currentUser();
        const r = addPayment(
          { ...(d as Entry), id: e?.id ?? "new" },
          { date: payDate || today(), amount: pay, method: payMethod, bankName: payMethod === "bank_transfer" ? payBank.trim() || null : null },
          { id: who?.id, name: who?.name },
          new Date(),
        );
        if (!r.ok) throw new PaymentRefused(r.reason);
        Object.assign(d, r.patch);
      }
      if (defaulted && d.paymentStatus !== "settled") Object.assign(d, { paymentStatus: "defaulted", defaultedAt: e?.defaultedAt ?? new Date().toISOString() });
      else if (!defaulted && d.paymentStatus === "defaulted") Object.assign(d, { paymentStatus: null, defaultedAt: null });
    }
    return d;
  }

  function save() {
    if (saving) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      onSave(build());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof PaymentRefused ? err.message : "That didn't save. Check your connection and try again.");
      setSaving(false);
    }
  }

  function requestClose() {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }

  // --- pieces ----------------------------------------------------------------------------
  const field = "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao";
  const label = "text-[13px] font-semibold text-muted-foreground";

  // Plain render helpers, not components: a component defined in here would be a new type on
  // every keystroke, and React would remount its input and drop the cursor.
  const bankPicker = (value: string, onChange: (v: string) => void) => (
    <label className="flex flex-col gap-1">
      <span className={label}>Bank</span>
      <input list="transaction-banks" value={value} onChange={(ev) => onChange(ev.target.value)} placeholder="e.g. BDO or BPI" className={field} />
    </label>
  );

  const methodPicker = (value: PaymentMethod, onChange: (m: PaymentMethod) => void) => (
    <Segmented ariaLabel="How it was paid" value={value} onChange={onChange} choices={METHOD_CHOICES} />
  );

  const owedSoFar = e ? outstanding(e) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : requestClose())}>
      <DialogContent className="flex max-h-[92svh] flex-col gap-0 overflow-hidden rounded-2xl border border-border p-0 ring-0 sm:max-w-lg">
        <DialogHeader className="border-b border-line/10 px-5 py-4">
          <DialogTitle className="text-[18px]">{e ? "Change transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription className="sr-only">Fill in the details, then press Save.</DialogDescription>
        </DialogHeader>

        <datalist id="transaction-banks">
          {COMMON_BANKS.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* What kind */}
          <div className="flex flex-col gap-1.5">
            <span className={label}>What happened?</span>
            <Tiles
              ariaLabel="Kind of transaction"
              value={kind}
              onChange={setKind}
              choices={kinds.map((k) => ({ value: k, label: KIND_LABEL[k], icon: KIND_ICON[k] }))}
            />
          </div>

          {kind === "investment" && (
            <div className="flex flex-col gap-1.5">
              <span className={label}>What kind of investment?</span>
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                {(
                  [
                    ["capital", "Money put in", "An owner or investor adds money to the business", HandCoins],
                    ["asset", "Something bought to keep", "Machinery, a freezer, equipment", Wrench],
                  ] as const
                ).map(([k, title, hint, Icon]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setInvKind(k)}
                    aria-pressed={invKind === k}
                    className={`flex min-h-[68px] items-center gap-3 rounded-xl border p-3 text-left transition active:scale-[0.98] ${
                      invKind === k ? "border-cacao bg-cacao/[0.08] shadow-sm" : "border-line/20 bg-card hover:border-cacao/50"
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${invKind === k ? "bg-cacao text-ivory" : "bg-secondary text-muted-foreground"}`}>
                      <Icon className="h-5 w-5" strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold">{title}</span>
                      <span className="block text-[12px] text-muted-foreground">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sale: the order */}
          {kind === "sale" && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className={label}>Price type</span>
                <Segmented ariaLabel="Price type" value={priceType} onChange={changePriceType} choices={PRICE_CHOICES} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={label}>Products in this order</span>
                {catalog.length === 0 && lines.length === 0 && (
                  <p className="text-[13px] text-muted-foreground">No products yet — add them in Costing first.</p>
                )}
                <ul className="flex flex-col divide-y divide-line/10 rounded-xl border border-line/15">
                  {/* Lines whose product has since been removed stay as they were sold. */}
                  {lines
                    .filter((l) => !l.productId || !products.some((p) => p.id === l.productId))
                    .map((l) => (
                      <li key={l.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <input type="checkbox" checked readOnly className="h-5 w-5 accent-[#7B4B2A]" aria-label={l.name} />
                        <span className="min-w-0 flex-1 text-[14px]">
                          {l.name} <span className="text-[12px] text-muted-foreground">(no longer in Costing)</span>
                        </span>
                        <span className="text-[13px] tabular-nums">
                          {l.qty} × {formatPeso(num(l.price))}
                        </span>
                        <button type="button" onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} className="text-[12px] font-semibold text-danger">
                          Remove
                        </button>
                      </li>
                    ))}
                  {catalog.map(({ product: p, name }) => {
                    const line = lineFor(p.id);
                    const on = Boolean(line);
                    return (
                      <li key={p.id} className="flex flex-col gap-2 px-3 py-2">
                        <label className="flex min-h-11 cursor-pointer items-center gap-3">
                          <input type="checkbox" checked={on} onChange={() => toggle(p)} className="h-5 w-5 shrink-0 accent-[#7B4B2A]" />
                          <span className="min-w-0 flex-1 text-[14px] font-medium">{name}</span>
                          <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">{formatPeso(priceOf(p, priceType))}</span>
                        </label>
                        {line && (
                          <div className="flex flex-wrap items-center gap-2 pl-8">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={`Fewer ${name}`}
                                onClick={() => patchLine(p.id, { qty: String(Math.max(1, num(line.qty) - 1)) })}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-line/20 transition hover:border-cacao hover:text-cacao active:scale-90"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <input
                                inputMode="decimal"
                                aria-label={`How many ${name}`}
                                value={line.qty}
                                onChange={(ev) => patchLine(p.id, { qty: ev.target.value.replace(/[^0-9.]/g, "") })}
                                className="h-9 w-14 rounded-lg border border-input bg-transparent text-center text-[15px]"
                              />
                              <button
                                type="button"
                                aria-label={`More ${name}`}
                                onClick={() => patchLine(p.id, { qty: String(num(line.qty) + 1) })}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-line/20 transition hover:border-cacao hover:text-cacao active:scale-90"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                            <span className="text-[13px] text-muted-foreground">at ₱</span>
                            <input
                              inputMode="decimal"
                              aria-label={`Price per ${name}`}
                              value={line.price}
                              onChange={(ev) => patchLine(p.id, { price: ev.target.value.replace(/[^0-9.]/g, "") })}
                              className="h-11 w-24 rounded-lg border border-input bg-transparent px-2 text-right text-[15px]"
                            />
                            <span className="ml-auto text-[14px] font-semibold tabular-nums">
                              {formatPeso(lineSubtotal({ productId: null, name, quantity: num(line.qty), unitPrice: num(line.price) }))}
                            </span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="flex items-baseline justify-between rounded-xl bg-secondary px-3 py-2.5">
                  <span className="text-[14px] font-semibold">
                    Total · {orderQuantity(orderLines)} {orderQuantity(orderLines) === 1 ? "unit" : "units"}
                  </span>
                  <span className="font-display text-[20px] font-bold">{formatPeso(saleTotal)}</span>
                </div>
              </div>
              <label className="flex flex-col gap-1">
                <span className={label}>
                  Buyer name <span className="text-danger">*</span>
                </span>
                <CustomerNameInput value={customer} onChange={setCustomer} className={field} placeholder="Who bought it" />
              </label>
            </>
          )}

          {/* Expense */}
          {kind === "expense" && (
            <>
              <label className="flex flex-col gap-1">
                <span className={label}>What was it for?</span>
                <input value={what} onChange={(ev) => setWhat(ev.target.value)} placeholder="e.g. Electricity bill" className={field} />
              </label>
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className={label}>Category</span>
                  <select value={category} onChange={(ev) => setCategory(ev.target.value)} className={field}>
                    {allExpenseCategories(categoryBudgets)
                      // Salaries are the owners' to record.
                      .filter((c) => exec || !PAYROLL_CATEGORIES.has(c.toLowerCase()))
                      .map((c) => (
                      <option key={c} value={c}>
                        {EXPENSE_CATEGORY_LABELS[c] ?? c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={label}>Amount (₱)</span>
                  <input inputMode="decimal" value={amount} onChange={(ev) => setAmount(ev.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className={field} />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className={label}>
                  Paid to <span className="text-danger">*</span>
                </span>
                <SupplierNameInput value={party} onChange={setParty} className={field} placeholder="Shop or supplier" />
              </label>
            </>
          )}

          {/* Investment */}
          {kind === "investment" && invKind === "capital" && (
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={label}>Who put the money in?</span>
                <input value={party ?? ""} onChange={(ev) => setParty(ev.target.value)} placeholder="Owner or investor" className={field} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={label}>Amount received (₱)</span>
                <input inputMode="decimal" value={amount} onChange={(ev) => setAmount(ev.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className={field} />
              </label>
            </div>
          )}
          {kind === "investment" && invKind === "asset" && (
            <>
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className={label}>What was bought?</span>
                  <input value={what} onChange={(ev) => setWhat(ev.target.value)} placeholder="e.g. Freezer" className={field} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={label}>Price (₱)</span>
                  <input inputMode="decimal" value={amount} onChange={(ev) => setAmount(ev.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className={field} />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className={label}>Bought from</span>
                <SupplierNameInput value={party} onChange={setParty} className={field} placeholder="Seller (optional)" />
              </label>
            </>
          )}

          {/* Spoilage */}
          {kind === "spoilage" && (
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-[1fr_120px]">
              <label className="flex flex-col gap-1">
                <span className={label}>What was lost?</span>
                <select value={lostProduct} onChange={(ev) => setLostProduct(ev.target.value)} className={field}>
                  <option value="">Pick a product</option>
                  {catalog.map(({ product: p, name }) => (
                    <option key={p.id} value={p.id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={label}>How many?</span>
                <input inputMode="decimal" value={lostQty} onChange={(ev) => setLostQty(ev.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className={field} />
              </label>
              {exec && (
                <p className="text-[13px] text-muted-foreground min-[420px]:col-span-2">
                  {lostValue != null ? `Worth ${formatPeso(lostValue)} at cost.` : "Its value can't be worked out until the recipe is fully priced."}
                </p>
              )}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className={label}>Date</span>
            <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} className={field} />
          </label>

          {/* Payment */}
          {showPayment && (
            <fieldset className="flex flex-col gap-3 rounded-xl border border-line/15 p-3.5">
              <legend className="px-1 text-[13px] font-semibold">Payment</legend>
              {owedKind && (
                <Segmented
                  ariaLabel="When it is paid"
                  value={when}
                  onChange={setWhen}
                  choices={[
                    { value: "now", label: "Paid now", icon: CircleCheck },
                    { value: "later", label: kind === "sale" ? "Customer pays later" : "We pay later", icon: Clock },
                  ]}
                />
              )}
              <div className="flex flex-col gap-1">
                <span className={label}>{when === "later" && owedKind ? "Will be paid by" : "Paid by"}</span>
                {methodPicker(method, setMethod)}
              </div>
              {method === "bank_transfer" && bankPicker(bank, setBank)}

              {when === "later" && owedKind && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className={label}>Due on</span>
                    <input type="date" value={dueDate} onChange={(ev) => setDueDate(ev.target.value)} className={field} />
                  </label>
                  {e && (e.paymentTerm === "receivable" || e.paymentTerm === "payable") && (
                    <p className="text-[13px]">
                      Paid so far <span className="font-semibold">{formatPeso(paidSoFar(e))}</span> · still owed{" "}
                      <span className="font-semibold">{formatPeso(owedSoFar)}</span>
                    </p>
                  )}
                  <div className="flex flex-col gap-2 rounded-lg bg-secondary/60 p-3">
                    <span className="text-[13px] font-semibold">{e ? "Record a payment" : "Paid anything already?"}</span>
                    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className={label}>Amount paid (₱)</span>
                        <input inputMode="decimal" value={payAmount} onChange={(ev) => setPayAmount(ev.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className={field} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={label}>Paid on</span>
                        <input type="date" value={payDate} onChange={(ev) => setPayDate(ev.target.value)} className={field} />
                      </label>
                    </div>
                    {num(payAmount) > 0 && (
                      <>
                        {methodPicker(payMethod, setPayMethod)}
                        {payMethod === "bank_transfer" && bankPicker(payBank, setPayBank)}
                      </>
                    )}
                  </div>
                  {e?.payments?.length ? (
                    <ul className="flex flex-col gap-0.5 text-[13px] text-muted-foreground">
                      {e.payments.map((p, i) => (
                        <li key={i}>
                          {p.date} — {formatPeso(p.amount)} · {describePaymentMethod(p.method, p.bankName)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {e && (
                    <label className="flex min-h-11 items-center gap-2 text-[14px]">
                      <input type="checkbox" checked={defaulted} onChange={(ev) => setDefaulted(ev.target.checked)} className="h-5 w-5 accent-[#B3261E]" />
                      Mark as defaulted — not expected to be paid. It stays counted as still owed.
                    </label>
                  )}
                </>
              )}
            </fieldset>
          )}

          <label className="flex flex-col gap-1">
            <span className={label}>Notes</span>
            <textarea value={notes} onChange={(ev) => setNotes(ev.target.value)} rows={2} placeholder="Optional" className="rounded-lg border border-input bg-transparent px-3 py-2 text-[15px] outline-none focus:border-cacao" />
          </label>

          {e && onDelete && (
            <div className="flex justify-start">
              <ConfirmDeleteButton
                label="Delete this transaction"
                onConfirm={() => {
                  onDelete();
                  onOpenChange(false);
                }}
              />
            </div>
          )}
        </div>

        {/* Always in view */}
        <div className="border-t border-line/10 bg-card px-5 py-3">
          {error && (
            <p role="alert" className="mb-2 text-[14px] font-semibold text-danger">
              {error}
            </p>
          )}
          {confirmDiscard ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[14px]">Close without saving what you typed?</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmDiscard(false)} className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold">
                  Keep editing
                </button>
                <button type="button" onClick={() => onOpenChange(false)} className="min-h-11 rounded-[10px] bg-danger px-4 text-[14px] font-semibold text-white">
                  Discard
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="min-h-10 flex-1 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold transition hover:bg-secondary active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[10px] bg-cacao px-4 text-[14px] font-semibold text-ivory transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                <Check className="h-4 w-4" strokeWidth={2.2} />
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
