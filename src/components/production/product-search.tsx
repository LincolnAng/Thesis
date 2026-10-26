"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { familiesOf, fullName } from "@/lib/summary/product-sizes";
import { fieldCls } from "@/components/production/add-batch-dialog";

/**
 * Pick one product by typing part of its name — every product and size as Inventory lists them.
 * The list stays open under the box; the picked one is highlighted.
 */
export function ProductSearch({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { products } = useStore();
  const [query, setQuery] = useState("");
  const options = familiesOf(products)
    .sort((a, b) => a.head.name.localeCompare(b.head.name))
    .flatMap((f) => f.all)
    .map((p) => ({ id: p.id, label: fullName(p, products) }));
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" aria-label="Search products" className={`${fieldCls} pl-9`} />
      </div>
      <ul role="listbox" aria-label="Products" className="max-h-52 overflow-y-auto rounded-lg border border-line/20 bg-card py-1">
        {shown.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              role="option"
              aria-selected={o.id === value}
              onClick={() => onChange(o.id)}
              className={`w-full px-3 py-2 text-left text-[14px] ${o.id === value ? "bg-cacao font-semibold text-ivory" : "hover:bg-secondary"}`}
            >
              {o.label}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-2 text-[13px] text-muted-foreground">No product matches “{query.trim()}”.</li>}
      </ul>
    </div>
  );
}
