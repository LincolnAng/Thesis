"use client";

import { CircleAlert, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/format";
import { ENTRY_TYPE_LABELS } from "@/lib/format";
import { findProduct } from "@/lib/summary/product-match";
import { useStore } from "@/lib/store/use-store";
import type { EntryDraft } from "@/lib/home/describe-entry";
import { cn } from "@/lib/utils";
import { MethodFields } from "@/components/transactions/method-fields";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";

/**
 * What the assistant understood, shown before anything is written.
 *
 * The old flow saved first and offered Undo, which meant a misread sale had already moved
 * stock and revenue by the time the owner saw it. Nothing here touches the ledger until the
 * confirm button is pressed, and anything the owner didn't actually say is marked as a guess
 * rather than presented as fact.
 *
 * A sale or expense paid on the spot asks how it was paid — Cash, or Bank transfer and which
 * bank — right in the card, so it's recorded with the entry. Executives only: payment details
 * are owner-only (lib/auth/permissions).
 */
export function ReviewCard({
  draft,
  stated,
  onConfirm,
  onEdit,
  onPatch,
}: {
  draft: EntryDraft;
  stated: string[];
  onConfirm: () => void;
  onEdit: () => void;
  /** Changes the proposed entry before it's saved — here, how it was paid. */
  onPatch?: (patch: Partial<EntryDraft>) => void;
}) {
  const { products } = useStore();
  const exec = isExecutive(useCurrentUser());
  const owedLater = draft.paymentTerm === "receivable" || draft.paymentTerm === "payable";
  const asksMethod = exec && !!onPatch && (draft.type === "SALE" || draft.type === "EXPENSE") && !owedLater;
  const needsBank = asksMethod && draft.paymentMethod === "bank_transfer" && !(draft.bankName ?? "").trim();
  const isStated = (field: string) => stated.includes(field);

  // An order of several products names each one by id; a single item is matched by name.
  const lines = draft.lineItems ?? [];
  const isOrder = lines.length > 0;
  const matchedProduct = isOrder ? undefined : findProduct(products, draft.sku);
  const productUnknown = !isOrder && Boolean(draft.sku) && !matchedProduct && (draft.type === "SALE" || draft.type === "WASTE");
  const needsProduct = draft.type === "SALE" && !isOrder && !matchedProduct;

  const rows: Array<{ field: string; label: string; value: string | null }> = [
    { field: "type", label: "Transaction type", value: ENTRY_TYPE_LABELS[draft.type] ?? draft.type },
    { field: "amount", label: "Total amount", value: draft.amount == null ? null : formatPeso(draft.amount) },
    ...(isOrder
      ? []
      : [
          { field: "quantity", label: "How many", value: draft.quantity == null ? null : String(draft.quantity) },
          { field: "unit", label: "Unit", value: draft.unit },
          { field: "sku", label: draft.type === "SALE" || draft.type === "WASTE" ? "Product" : "For", value: draft.sku },
        ]),
    { field: "counterparty", label: draft.type === "SALE" ? "Buyer" : "Paid to", value: draft.counterparty },
    { field: "notes", label: "Note", value: draft.notes ?? null },
    {
      field: "date",
      label: "Date",
      value: new Date(draft.timestamp).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }),
    },
  ];
  // Type and date are always worked out, never something she has to have said.
  const alwaysKnown = new Set(["type", "date"]);

  return (
    <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-3">
      <div>
        <p className="text-sm font-semibold text-foreground">
          {ENTRY_TYPE_LABELS[draft.type] ?? draft.type} — check this before I save it
        </p>
        <p className="text-xs text-muted-foreground">Status: pending confirmation — nothing has been recorded yet.</p>
      </div>

      {isOrder && (
        <div className="rounded-xl bg-secondary/60 px-2.5 py-2">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">
            {lines.length === 1 ? "Product" : `${lines.length} products in this order`}
          </p>
          <ul className="space-y-1">
            {lines.map((l, i) => (
              <li key={`${l.productId ?? l.name}-${i}`} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{l.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {l.quantity} × {formatPeso(l.unitPrice)}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formatPeso(l.quantity * l.unitPrice)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.field} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            {row.value ? (
              <span className="flex items-baseline gap-1.5 text-right">
                <span className="font-medium text-foreground">{row.value}</span>
                {!isStated(row.field) && !alwaysKnown.has(row.field) && (
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

      {asksMethod && onPatch && (
        <div className="border-t border-line/10 pt-2.5">
          <MethodFields
            label="Paid by"
            method={draft.paymentMethod ?? null}
            bankName={draft.bankName ?? null}
            onChange={(n) =>
              onPatch({
                paymentTerm: draft.paymentTerm ?? "spot",
                paymentMethod: n.method === "bank_transfer" ? "bank_transfer" : n.method === "cash" ? "cash" : null,
                bankName: n.method === "bank_transfer" ? n.bankName : null,
              })
            }
          />
        </div>
      )}
      {owedLater && exec && (
        <p className="text-xs text-muted-foreground">{draft.paymentTerm === "receivable" ? "The customer pays later" : "Paid later"}
          {draft.dueDate ? `, due ${new Date(draft.dueDate).toLocaleDateString("en-PH", { month: "long", day: "numeric" })}` : ""} — how it&apos;s paid is asked when the payment comes in.</p>
      )}

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
        <Button size="sm" className="flex-1" disabled={needsProduct || needsBank} onClick={onConfirm}>
          Log this {draft.type === "SALE" ? "sale" : draft.type === "EXPENSE" ? "expense" : "entry"}
        </Button>
        <Button size="sm" variant="secondary" className={cn("gap-1", needsProduct && "flex-1")} onClick={onEdit}>
          <PencilLine className="h-3.5 w-3.5" />
          Change
        </Button>
      </div>
      {needsBank && <p className="text-xs text-muted-foreground">Which bank? Pick it above to log this.</p>}
      {needsProduct && (
        <p className="text-xs text-muted-foreground">
          A sale needs a product so it can come off your stock. Tap Change to pick one.
        </p>
      )}
    </div>
  );
}
