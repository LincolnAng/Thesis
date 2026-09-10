"use client";

import { CircleAlert, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/format";
import { ENTRY_TYPE_LABELS } from "@/lib/format";
import { findProduct } from "@/lib/summary/product-match";
import { useStore } from "@/lib/store/use-store";
import type { EntryDraft } from "@/lib/home/describe-entry";
import { cn } from "@/lib/utils";

/**
 * What the assistant understood, shown before anything is written.
 *
 * The old flow saved first and offered Undo, which meant a misread sale had already moved
 * stock and revenue by the time the owner saw it. Nothing here touches the ledger until the
 * confirm button is pressed, and anything the owner didn't actually say is marked as a guess
 * rather than presented as fact.
 */
export function ReviewCard({
  draft,
  stated,
  onConfirm,
  onEdit,
}: {
  draft: EntryDraft;
  stated: string[];
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const { products } = useStore();
  const isStated = (field: string) => stated.includes(field);

  const matchedProduct = findProduct(products, draft.sku);
  const productUnknown = Boolean(draft.sku) && !matchedProduct;
  const needsProduct = draft.type === "SALE" && !matchedProduct;

  const rows: Array<{ field: string; label: string; value: string | null }> = [
    { field: "amount", label: "Amount", value: draft.amount == null ? null : formatPeso(draft.amount) },
    { field: "quantity", label: "How many", value: draft.quantity == null ? null : String(draft.quantity) },
    { field: "unit", label: "Unit", value: draft.unit },
    { field: "sku", label: "Product", value: draft.sku },
    { field: "counterparty", label: draft.type === "SALE" ? "Buyer" : "Paid to", value: draft.counterparty },
    { field: "notes", label: "Note", value: draft.notes ?? null },
  ];

  return (
    <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-3">
      <div>
        <p className="text-sm font-semibold text-foreground">
          {ENTRY_TYPE_LABELS[draft.type] ?? draft.type} — check this before I save it
        </p>
        <p className="text-xs text-muted-foreground">Nothing has been recorded yet.</p>
      </div>

      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.field} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            {row.value ? (
              <span className="flex items-baseline gap-1.5 text-right">
                <span className="font-medium text-foreground">{row.value}</span>
                {!isStated(row.field) && (
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    guess
                  </span>
                )}
              </span>
            ) : (
              <span className="text-xs italic text-muted-foreground/70">you didn&apos;t say</span>
            )}
          </li>
        ))}
      </ul>

      {productUnknown && (
        <p className="flex items-start gap-1.5 rounded-xl bg-[var(--status-warning)]/10 p-2 text-xs text-[var(--status-warning)]">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            I don&apos;t have a product called &ldquo;{draft.sku}&rdquo; — add it, or pick an existing one before
            saving.
          </span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" className="flex-1" disabled={needsProduct} onClick={onConfirm}>
          Log this {draft.type === "SALE" ? "sale" : "entry"}
        </Button>
        <Button size="sm" variant="secondary" className={cn("gap-1", needsProduct && "flex-1")} onClick={onEdit}>
          <PencilLine className="h-3.5 w-3.5" />
          Change
        </Button>
      </div>
      {needsProduct && (
        <p className="text-xs text-muted-foreground">
          A sale needs a product so it can come off your stock. Tap Change to pick one.
        </p>
      )}
    </div>
  );
}
