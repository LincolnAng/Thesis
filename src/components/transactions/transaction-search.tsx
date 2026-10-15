"use client";

import { Search, X } from "lucide-react";

export interface TransactionFilters {
  text: string;
  product: string;
  person: string;
  type: string;
  status: string;
  recordedBy: string;
}

export const EMPTY_FILTERS: TransactionFilters = { text: "", product: "", person: "", type: "", status: "", recordedBy: "" };

export const STATUS_FILTERS: [string, string][] = [
  ["spot", "Paid on the spot"],
  ["pending", "Not paid yet"],
  ["partial", "Partly paid"],
  ["settled", "Paid in full"],
  ["overdue", "Overdue"],
];

/**
 * One search bar with its filters built in, the way a booking site lays out "where · when ·
 * who": type to search, then narrow by product, customer or supplier, type, payment status
 * and who recorded it. Every choice combines with the others.
 */
export function TransactionSearch({
  value,
  onChange,
  products,
  people,
  recorders,
  showType,
  showStatus,
}: {
  value: TransactionFilters;
  onChange: (next: TransactionFilters) => void;
  products: string[];
  people: string[];
  recorders: string[];
  showType: boolean;
  showStatus: boolean;
}) {
  const set = (key: keyof TransactionFilters) => (v: string) => onChange({ ...value, [key]: v });
  const active = Object.values(value).some(Boolean);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line/20 bg-card shadow-sm min-[1000px]:flex-row min-[1000px]:items-stretch">
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
      <Segment label="Customer / supplier" value={value.person} onChange={set("person")} options={people.map((p) => [p, p])} />
      {showType && (
        <Segment
          label="Type"
          value={value.type}
          onChange={set("type")}
          options={[
            ["SALE", "Sales"],
            ["EXPENSE", "Expenses"],
            ["RND", "Investments"],
            ["WASTE", "Spoilage"],
          ]}
        />
      )}
      {showStatus && <Segment label="Payment" value={value.status} onChange={set("status")} options={STATUS_FILTERS} />}
      <Segment label="Recorded by" value={value.recordedBy} onChange={set("recordedBy")} options={recorders.map((p) => [p, p])} />
      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="flex items-center justify-center gap-1 border-t border-line/15 px-4 py-2.5 text-[13px] font-semibold text-cacao min-[1000px]:border-l min-[1000px]:border-t-0"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}

function Segment({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col justify-center border-t border-line/15 px-4 py-1.5 min-[1000px]:border-l min-[1000px]:border-t-0">
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
