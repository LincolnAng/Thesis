"use client";

import { useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";

export interface TransactionFilters {
  text: string;
  product: string;
  person: string;
  recordedBy: string;
  /** Where it stands: paid on the spot, not paid yet, partly paid, paid in full, defaulted, overdue. */
  status: string;
  /** "cash" or "bank_transfer". */
  method: string;
  bank: string;
  /** "standard", "friend" or "wholesale". */
  priceType: string;
  /** An expense category. */
  category: string;
  /** "YYYY-MM-DD" bounds on the transaction's day; either may be empty. */
  dateFrom: string;
  dateTo: string;
  /** Pesos, as typed; either may be empty. */
  minAmount: string;
  maxAmount: string;
}

export const EMPTY_FILTERS: TransactionFilters = {
  text: "",
  product: "",
  person: "",
  recordedBy: "",
  status: "",
  method: "",
  bank: "",
  priceType: "",
  category: "",
  dateFrom: "",
  dateTo: "",
  minAmount: "",
  maxAmount: "",
};

export const STATUS_FILTERS: [string, string][] = [
  ["spot", "Paid on the spot"],
  ["pending", "Not paid yet"],
  ["partial", "Partly paid"],
  ["settled", "Paid in full"],
  ["overdue", "Overdue"],
  ["defaulted", "Defaulted"],
];

const METHOD_FILTERS: [string, string][] = [
  ["cash", "Cash"],
  ["bank_transfer", "Bank transfer"],
];

const PRICE_TYPE_FILTERS: [string, string][] = [
  ["standard", "Regular price"],
  ["friend", "Friend price"],
  ["wholesale", "Wholesale price"],
];

/** The filters tucked under "More filters", so the bar stays one line until they are wanted. */
const MORE_KEYS: (keyof TransactionFilters)[] = ["status", "method", "bank", "priceType", "category", "dateFrom", "dateTo", "minAmount", "maxAmount"];

/**
 * One search bar with its filters built in: type to search, then narrow by product, customer or
 * supplier and who recorded it. "More filters" adds the rest of a transaction's characteristics —
 * its payment status, how and through which bank it was paid, its price type, an expense's
 * category, a range of dates and a range of amounts. Every choice combines with the others.
 *
 * The payment filters are executives' only: an employee's copy has no payment data to filter by.
 */
export function TransactionSearch({
  value,
  onChange,
  products,
  people,
  recorders,
  banks,
  categories,
  showPayment,
}: {
  value: TransactionFilters;
  onChange: (next: TransactionFilters) => void;
  products: string[];
  people: string[];
  recorders: string[];
  banks: string[];
  categories: [string, string][];
  showPayment: boolean;
}) {
  const set = (key: keyof TransactionFilters) => (v: string) => onChange({ ...value, [key]: v });
  const active = Object.values(value).some(Boolean);
  const moreCount = MORE_KEYS.filter((k) => value[k]).length;
  const [moreOpen, setMoreOpen] = useState(moreCount > 0);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line/20 bg-card shadow-sm">
      <div className="flex flex-col min-[1000px]:flex-row min-[1000px]:items-stretch">
        <label className="flex min-w-0 flex-[1.4] items-center gap-2 px-4 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">Search transactions</span>
          <input
            value={value.text}
            onChange={(e) => set("text")(e.target.value)}
            placeholder="Search transactions"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
          />
        </label>
        <Segment label="Product" value={value.product} onChange={set("product")} options={products.map((p) => [p, p])} />
        <Segment label="Customer or supplier" value={value.person} onChange={set("person")} options={people.map((p) => [p, p])} />
        <Segment label="Recorded by" value={value.recordedBy} onChange={set("recordedBy")} options={recorders.map((p) => [p, p])} />
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className="flex items-center justify-center gap-1.5 border-t border-line/15 px-4 py-2.5 text-[13px] font-semibold text-cacao min-[1000px]:border-l min-[1000px]:border-t-0"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          More filters
          {moreCount > 0 && <span className="rounded-full bg-cacao px-1.5 text-[11.5px] text-ivory">{moreCount}</span>}
          <ChevronDown className={`h-3.5 w-3.5 transition ${moreOpen ? "rotate-180" : ""}`} />
        </button>
        {active && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="flex items-center justify-center gap-1 border-t border-line/15 px-4 py-2.5 text-[13px] font-semibold text-muted-foreground hover:text-danger min-[1000px]:border-l min-[1000px]:border-t-0"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {moreOpen && (
        <div className="grid grid-cols-2 border-t border-line/15 min-[700px]:grid-cols-3 min-[1000px]:grid-cols-4">
          {showPayment && <Segment stacked label="Payment status" value={value.status} onChange={set("status")} options={STATUS_FILTERS} />}
          {showPayment && <Segment stacked label="Paid by" value={value.method} onChange={set("method")} options={METHOD_FILTERS} />}
          {showPayment && <Segment stacked label="Bank" value={value.bank} onChange={set("bank")} options={banks.map((b) => [b, b])} />}
          <Segment stacked label="Price type" value={value.priceType} onChange={set("priceType")} options={PRICE_TYPE_FILTERS} />
          <Segment stacked label="Expense category" value={value.category} onChange={set("category")} options={categories} />
          <DateField label="From" value={value.dateFrom} max={value.dateTo || undefined} onChange={set("dateFrom")} />
          <DateField label="To" value={value.dateTo} min={value.dateFrom || undefined} onChange={set("dateTo")} />
          <AmountField label="Amount from (₱)" value={value.minAmount} onChange={set("minAmount")} />
          <AmountField label="Amount up to (₱)" value={value.maxAmount} onChange={set("maxAmount")} />
          {(value.dateFrom || value.dateTo) && (
            <p className="col-span-full border-t border-line/10 px-4 py-2 text-[12px] text-muted-foreground">
              A date range looks across every month, not just the one chosen above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const cell = "flex min-w-0 flex-col justify-center border-line/15 px-4 py-1.5";

function Segment({
  label,
  value,
  onChange,
  options,
  stacked,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  /** In the grid under "More filters" rather than the one-line bar. */
  stacked?: boolean;
}) {
  return (
    <label className={`${cell} flex-1 border-t ${stacked ? "min-[700px]:border-l" : "min-[1000px]:border-l min-[1000px]:border-t-0"}`}>
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`-ml-1 w-full bg-transparent text-[13.5px] outline-none ${value ? "font-semibold text-foreground" : "text-muted-foreground"}`}
      >
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateField({ label, value, onChange, min, max }: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  return (
    <label className={`${cell} border-t min-[700px]:border-l`}>
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-transparent text-[13.5px] outline-none ${value ? "font-semibold text-foreground" : "text-muted-foreground"}`}
      />
    </label>
  );
}

function AmountField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={`${cell} border-t min-[700px]:border-l`}>
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        placeholder="Any"
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        className={`w-full bg-transparent text-[13.5px] tabular-nums outline-none placeholder:text-muted-foreground ${value ? "font-semibold text-foreground" : ""}`}
      />
    </label>
  );
}
