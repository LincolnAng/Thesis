"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatPeso, pluralize } from "@/lib/format";
import { replaceEntry } from "@/lib/store/store";
import { useStore } from "@/lib/store/use-store";
import { entryToDraft } from "@/lib/home/describe-entry";
import type { Entry } from "@/lib/store/types";

/**
 * Sales logged before a product was required have no product attached, which quietly breaks
 * three things at once: the sale never came off stock, it can't appear in best sellers, and
 * Customers shows it as an unspecified item. Fixing one repairs all three.
 */
export function MissingProductBanner({ sales }: { sales: Entry[] }) {
  const { products } = useStore();
  const [open, setOpen] = useState(false);
  const broken = sales.filter((e) => !e.sku);

  if (broken.length === 0) return null;

  function assign(entry: Entry, sku: string) {
    if (!sku) return;
    replaceEntry(entry.id, { ...entryToDraft(entry), sku });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/5 p-4">
      <div className="flex items-start gap-2.5">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-warning)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {pluralize(broken.length, "sale")} missing a product
          </p>
          <p className="text-xs text-muted-foreground">
            Fixing {broken.length === 1 ? "it" : "them"} will update your stock and best sellers.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Fix"}
        </Button>
      </div>

      {open && (
        <ul className="space-y-2">
          {broken.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5">
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium text-foreground">{formatPeso(entry.amount)}</span>
                <span className="text-muted-foreground">
                  {entry.quantity ? ` · ${entry.quantity}` : ""}
                  {entry.counterparty ? ` · ${entry.counterparty}` : ""} · {formatDate(entry.timestamp)}
                </span>
              </span>
              <select
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                defaultValue=""
                onChange={(e) => assign(entry, e.target.value)}
              >
                <option value="">Pick a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
