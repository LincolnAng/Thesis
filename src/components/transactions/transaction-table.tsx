"use client";

import { Pencil } from "lucide-react";
import { EXPENSE_CATEGORY_LABELS, ENTRY_TYPE_LABELS, PRICE_TYPE_LABELS, formatPeso } from "@/lib/format";
import { dueInfo, outstanding, statusOf, termOf } from "@/lib/transactions/ledger";
import type { Entry } from "@/lib/store/types";

/**
 * Every recorded transaction as a plain table: read it, filter it, and press the pencil to
 * change a row. Changing happens in the same form that adds one, so the fields always match
 * the columns. Payment terms are drawn so a receivable or payable stands out at a glance —
 * and an overdue one stands out most.
 */
export function TransactionTable({
  rows,
  showPayment,
  onEdit,
  carriedFrom,
}: {
  rows: Entry[];
  /** Executives only — employees never see who owes what. */
  showPayment: boolean;
  onEdit: (entry: Entry) => void;
  /** For rows carried over from an earlier month: the month they come from, by id. */
  carriedFrom?: Map<string, string>;
}) {
  const now = new Date();
  if (rows.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-muted-foreground">No transactions match. Try another tab, month or filter.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-[13px]">
        <thead className="bg-secondary/50 text-[12px] font-semibold text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5">Date</th>
            <th className="px-3 py-2.5">Type</th>
            <th className="px-3 py-2.5">Item</th>
            <th className="px-3 py-2.5 text-right">Qty</th>
            <th className="px-3 py-2.5">Customer / paid to</th>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5 text-right">Amount</th>
            {showPayment && <th className="px-3 py-2.5">Payment</th>}
            <th className="px-3 py-2.5">Recorded by</th>
            <th className="w-12 px-2 py-2.5">
              <span className="sr-only">Edit</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const due = dueInfo(e, now);
            const overdue = showPayment && due.overdue;
            const from = carriedFrom?.get(e.id);
            return (
              <tr key={e.id} className={`border-t border-line/10 ${overdue ? "bg-danger/[0.05]" : ""}`}>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                  {new Date(e.timestamp).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                  {from && <div className="text-[11px] font-semibold text-cacao">Carried from {from}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <TypeChip e={e} />
                </td>
                <td className="max-w-[220px] truncate px-3 py-2.5" title={e.sku ?? e.rawText}>
                  {e.sku ?? <span className="text-muted-foreground">{e.rawText || "—"}</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{e.quantity ?? "—"}{e.quantity != null && e.unit ? ` ${e.unit}` : ""}</td>
                <td className="max-w-[180px] truncate px-3 py-2.5">{e.counterparty ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {e.type === "SALE" ? PRICE_TYPE_LABELS[e.priceType ?? "standard"] : e.category ? (EXPENSE_CATEGORY_LABELS[e.category] ?? e.category) : e.type === "RND" ? "R&D" : "—"}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${
                    e.amount == null ? "text-muted-foreground" : e.type === "SALE" ? "text-success" : e.type === "EXPENSE" || e.type === "RND" || e.type === "WASTE" ? "text-danger" : ""
                  }`}
                >
                  {e.amount == null ? "—" : `${e.type === "SALE" ? "+" : "−"}${formatPeso(e.amount)}`}
                </td>
                {showPayment && (
                  <td className="px-3 py-2.5">
                    <PaymentCell e={e} />
                  </td>
                )}
                <td className="px-3 py-2.5 text-muted-foreground">{e.loggedByName ?? "—"}</td>
                <td className="px-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => onEdit(e)}
                    aria-label={`Edit this ${(ENTRY_TYPE_LABELS[e.type] ?? "entry").toLowerCase()}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-cacao"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TypeChip({ e }: { e: Entry }) {
  const tone =
    e.type === "SALE"
      ? "bg-success/10 text-success"
      : e.type === "RND"
        ? "bg-cacao/10 text-cacao"
        : e.type === "WASTE"
          ? "bg-[var(--status-warning)]/10 text-[var(--status-warning)]"
          : "bg-danger/10 text-danger";
  const label = e.type === "WASTE" ? "Spoilage" : (ENTRY_TYPE_LABELS[e.type] ?? e.type);
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${tone}`}>{label}</span>;
}

const STATUS_TEXT = { pending: "Not paid yet", partial: "Partly paid", settled: "Paid" } as const;

function PaymentCell({ e }: { e: Entry }) {
  const term = termOf(e);
  if (e.type !== "SALE" && e.type !== "EXPENSE") return <span className="text-muted-foreground">—</span>;
  if (term === "spot") return <span className="text-muted-foreground">Spot</span>;

  const status = statusOf(e) ?? "pending";
  const due = dueInfo(e, new Date());
  const owed = outstanding(e);
  const termChip = term === "receivable" ? "bg-success/10 text-success" : "bg-[var(--status-warning)]/10 text-[var(--status-warning)]";
  const statusChip =
    status === "settled" ? "border-success/40 text-success" : status === "partial" ? "border-[var(--status-warning)]/50 text-[var(--status-warning)]" : "border-line/30 text-muted-foreground";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${termChip}`}>{term === "receivable" ? "Receivable" : "Payable"}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusChip}`}>{STATUS_TEXT[status]}</span>
      </div>
      {owed > 0 && (
        <span className={`text-[11.5px] ${due.overdue ? "font-semibold text-danger" : "text-muted-foreground"}`}>
          {formatPeso(owed)} owed
          {due.daysLeft !== null &&
            (due.overdue
              ? ` · ${Math.abs(due.daysLeft)} day${Math.abs(due.daysLeft) === 1 ? "" : "s"} overdue`
              : due.daysLeft === 0
                ? " · due today"
                : ` · due in ${due.daysLeft} day${due.daysLeft === 1 ? "" : "s"}`)}
        </span>
      )}
    </div>
  );
}
