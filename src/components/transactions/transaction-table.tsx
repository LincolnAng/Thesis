"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import {
  EXPENSE_CATEGORY_LABELS,
  ENTRY_TYPE_LABELS,
  PRICE_TYPE_LABELS,
  describePaymentMethod,
  formatDate,
  formatPeso,
} from "@/lib/format";
import { dueInfo, outstanding, paidSoFar, statusOf, termOf, canBeOwed } from "@/lib/transactions/ledger";
import { lineSubtotal, quantitySold } from "@/lib/transactions/order-lines";
import type { Entry } from "@/lib/store/types";

/**
 * Every recorded transaction, laid out the way the original Transactions sheet was: a striped
 * grid with Date, Type, Item, Qty, Customer / Supplier, Category, Amount and who logged it, in
 * that order. What the payment rework added sits beside it rather than replacing it — a
 * Payment column for executives — and the arrow on a row opens its details: the products in a
 * multi-product order, how it was paid, and every payment made on it.
 *
 * Read-only: the pencil opens the same form that adds a transaction, which is where the money
 * rules are checked. Tap a column heading to sort by it.
 */

type SortKey = "date" | "qty" | "amount";

const STATUS_TEXT = { pending: "Not paid yet", partial: "Partly paid", settled: "Paid", defaulted: "Defaulted" } as const;

function categoryOf(e: Entry): string {
  if (e.type === "SALE") return e.priceType ? (PRICE_TYPE_LABELS[e.priceType] ?? e.priceType) : "Regular";
  if (e.type === "CAPITAL") return "Capital";
  if (e.type === "ASSET") return e.category ? (EXPENSE_CATEGORY_LABELS[e.category] ?? e.category) : "Asset";
  if (e.category) return EXPENSE_CATEGORY_LABELS[e.category] ?? e.category;
  return "—";
}

function TypeChip({ e }: { e: Entry }) {
  const tone =
    e.type === "SALE" || e.type === "CAPITAL"
      ? "bg-success/10 text-success"
      : e.type === "RND" || e.type === "ASSET"
        ? "bg-cacao/10 text-cacao"
        : e.type === "WASTE"
          ? "bg-[var(--status-warning)]/10 text-[var(--status-warning)]"
          : "bg-danger/10 text-danger";
  const label = e.type === "WASTE" ? "Spoilage" : (ENTRY_TYPE_LABELS[e.type] ?? e.type);
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-tight ${tone}`}>{label}</span>;
}

function PaymentCell({ e }: { e: Entry }) {
  const term = termOf(e);
  if (!canBeOwed(e) && e.type !== "CAPITAL") return <span className="text-muted-foreground">—</span>;
  if (term === "spot") return <span className="text-muted-foreground">{e.type === "CAPITAL" ? "Received" : "Paid"}</span>;

  const status = statusOf(e) ?? "pending";
  const due = dueInfo(e, new Date());
  const owed = outstanding(e);
  const termChip = term === "receivable" ? "bg-success/10 text-success" : "bg-[var(--status-warning)]/10 text-[var(--status-warning)]";
  const statusChip =
    status === "settled"
      ? "border-success/40 text-success"
      : status === "defaulted"
        ? "border-danger/50 text-danger"
        : status === "partial"
          ? "border-[var(--status-warning)]/50 text-[var(--status-warning)]"
          : "border-line/30 text-muted-foreground";

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${termChip}`}>{term === "receivable" ? "Owed to us" : "We owe"}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusChip}`}>{STATUS_TEXT[status]}</span>
      </div>
      {owed > 0 && (
        <span className={`text-[11.5px] ${due.overdue ? "font-semibold text-danger" : "text-muted-foreground"}`}>
          {formatPeso(owed)} left
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

/** What opens under a row: the order's products, how it was paid, and every payment. */
function Details({ e, showPayment }: { e: Entry; showPayment: boolean }) {
  const lines = e.lineItems ?? [];
  const payments = e.payments ?? [];
  return (
    <div className="grid grid-cols-1 gap-4 px-4 py-3 text-[13px] min-[800px]:grid-cols-2">
      {lines.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Products in this order</div>
          <table className="w-full">
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-line/5 last:border-0">
                  <td className="py-1 pr-2">{l.name}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{l.quantity} ×</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatPeso(l.unitPrice)}</td>
                  <td className="py-1 text-right font-semibold tabular-nums">{formatPeso(lineSubtotal(l))}</td>
                </tr>
              ))}
              <tr>
                <td className="pt-1.5 font-semibold">Total quantity sold</td>
                <td className="pt-1.5 text-right font-semibold tabular-nums">{quantitySold(e)}</td>
                <td />
                <td className="pt-1.5 text-right font-semibold tabular-nums">{formatPeso(e.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {showPayment && (canBeOwed(e) || e.type === "CAPITAL") && (
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Payment</div>
          {e.paymentMethod && <span>Method: {describePaymentMethod(e.paymentMethod, e.bankName)}</span>}
          {termOf(e) !== "spot" && (
            <>
              {e.dueDate && <span>Due: {formatDate(e.dueDate)}</span>}
              <span>
                Paid so far: {formatPeso(paidSoFar(e))} of {formatPeso(e.amount)} · {formatPeso(outstanding(e))} left
              </span>
              {payments.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {payments.map((p, i) => (
                    <li key={i} className="text-muted-foreground">
                      {formatDate(p.date)} — {formatPeso(p.amount)} · {describePaymentMethod(p.method, p.bankName)}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">No dated payments recorded yet.</span>
              )}
            </>
          )}
        </div>
      )}
      {e.notes && (
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Notes</div>
          <p>{e.notes}</p>
        </div>
      )}
    </div>
  );
}

const hasDetails = (e: Entry, showPayment: boolean) =>
  Boolean(e.lineItems?.length || e.notes || (showPayment && (canBeOwed(e) || e.type === "CAPITAL") && (termOf(e) !== "spot" || e.paymentMethod)));

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
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const val = (e: Entry) => (sort.key === "date" ? e.timestamp : sort.key === "qty" ? (quantitySold(e) ?? e.quantity ?? 0) : (e.amount ?? 0));
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, sort]);

  // Date · Type · Item · Qty sold · Customer / Supplier · Category · Amount · [Mode of payment · Payment] · Logged by · actions
  const columns = showPayment
    ? "grid-cols-[108px_118px_minmax(0,1.2fr)_76px_minmax(0,1fr)_110px_112px_128px_180px_96px_72px]"
    : "grid-cols-[108px_118px_minmax(0,1.2fr)_76px_minmax(0,1fr)_110px_112px_96px_72px]";

  const head = (label: string, key?: SortKey, right?: boolean) => (
    <div className={`px-1 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground ${right ? "text-right" : ""}`}>
      {key ? (
        <button
          type="button"
          onClick={() => setSort((s) => (s?.key === key ? (s.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }))}
          className="inline-flex items-center gap-1 uppercase hover:text-cacao"
          aria-label={`Sort by ${label}`}
        >
          {label}
          {sort?.key === key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
        </button>
      ) : (
        label
      )}
    </div>
  );

  if (rows.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-muted-foreground">No transactions match. Try another tab, month or filter.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className={showPayment ? "min-w-[1250px]" : "min-w-[920px]"}>
        <div className={`grid ${columns} gap-1 border-b border-line/15 bg-secondary px-2`}>
          {head("Date", "date")}
          {head("Type")}
          {head("Item")}
          {head("Qty sold", "qty", true)}
          {head("Customer / Supplier")}
          {head("Category")}
          {head("Amount", "amount", true)}
          {showPayment && head("Mode of payment")}
          {showPayment && head("Payment")}
          {head("Logged by")}
          {head("")}
        </div>

        {sorted.map((e, i) => {
          const carried = carriedFrom?.get(e.id);
          const overdue = showPayment && dueInfo(e, new Date()).overdue;
          const moneyIn = e.type === "SALE" || e.type === "CAPITAL";
          const qty = quantitySold(e);
          const expandable = hasDetails(e, showPayment);
          const isOpen = open.has(e.id);
          return (
            <Fragment key={e.id}>
              <div
                className={`grid ${columns} items-center gap-1 border-b border-line/5 px-2 py-2 text-[13px] ${
                  overdue ? "bg-danger/[0.05]" : i % 2 === 0 ? "bg-card" : "bg-[#FBFAF7] dark:bg-secondary/30"
                }`}
              >
                <div className="px-1">
                  <div>{formatDate(e.timestamp)}</div>
                  {carried && <div className="text-[11px] font-semibold text-[var(--status-warning)]">Carried from {carried}</div>}
                </div>
                <div className="px-1">
                  <TypeChip e={e} />
                </div>
                <div className="truncate px-1" title={e.sku ?? ""}>
                  {e.lineItems?.length ? (
                    <span>
                      <span className="font-semibold">{e.lineItems.length} products</span>
                      <span className="text-muted-foreground"> · {e.lineItems.map((l) => l.name).join(", ")}</span>
                    </span>
                  ) : (
                    (e.sku ?? <span className="text-muted-foreground">—</span>)
                  )}
                </div>
                <div className="px-1 text-right tabular-nums">{qty ?? <span className="text-muted-foreground">—</span>}</div>
                <div className="truncate px-1">{e.counterparty ?? <span className="text-muted-foreground">—</span>}</div>
                <div className="truncate px-1 text-muted-foreground">{categoryOf(e)}</div>
                <div className={`px-1 text-right font-semibold tabular-nums ${moneyIn ? "text-success" : "text-danger"}`}>
                  {e.amount == null ? <span className="font-normal text-muted-foreground">—</span> : `${moneyIn ? "+" : "−"}${formatPeso(e.amount)}`}
                </div>
                {showPayment && (
                  <div className="px-1 text-[12.5px]">
                    {e.paymentMethod ? (
                      <span className={`inline-block rounded-full px-2 py-0.5 font-semibold ${e.paymentMethod === "bank_transfer" ? "bg-[#3F6E8C]/10 text-[#3F6E8C]" : "bg-secondary text-foreground"}`}>
                        {describePaymentMethod(e.paymentMethod, e.bankName)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                )}
                {showPayment && (
                  <div className="px-1">
                    <PaymentCell e={e} />
                  </div>
                )}
                <div className="truncate px-1 text-muted-foreground">{e.loggedByName ?? "—"}</div>
                <div className="flex items-center justify-end gap-0.5">
                  {expandable && (
                    <button
                      type="button"
                      onClick={() =>
                        setOpen((prev) => {
                          const next = new Set(prev);
                          if (next.has(e.id)) next.delete(e.id);
                          else next.add(e.id);
                          return next;
                        })
                      }
                      aria-expanded={isOpen}
                      aria-label={isOpen ? "Hide details" : "Show details"}
                      className="flex h-11 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-cacao"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEdit(e)}
                    aria-label="Change this transaction"
                    className="flex h-11 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-cacao"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="border-b border-line/10 bg-secondary/40">
                  <Details e={e} showPayment={showPayment} />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
