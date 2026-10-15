"use client";

import { Fragment, useMemo, useState } from "react";
import { History as HistoryIcon, Pencil, Plus } from "lucide-react";
import { EXPENSE_CATEGORY_LABELS, PRICE_TYPE_LABELS, describePaymentMethod, formatDate, formatPeso } from "@/lib/format";
import { dueInfo, obligationInfo, obligationKind, outstanding, paymentsOf } from "@/lib/transactions/ledger";
import { QuickPay } from "@/components/transactions/obligation-dialogs";
import type { Entry } from "@/lib/store/types";

/**
 * Every recorded transaction, one row each, in one fixed set of columns — the same for sales,
 * expenses, receivables and payables, so what is owed reads exactly like what was paid:
 *
 *   Date · Customer / Supplier · Product · Qty · Amount · Mode of payment · Bank · Deadline · Recorded by
 *
 * An order of several products is still one row: its products are listed top to bottom in the
 * Product cell with their quantities lined up beside them, and the Amount is the order's total.
 *
 * Receivables and payables have a history button beside the pencil: it opens each payment (date,
 * how, amount), each time the deadline moved, and a default, with the actions to log a payment,
 * change the due date or mark a default. Only executives see the payment columns; an employee's
 * copy has no payment data at all. The pencil opens the form that adds a transaction, which is
 * where the money rules are checked. Tap a column heading to sort by it.
 */

type SortKey = "date" | "amount" | "due";

/** How it was (or last was) paid: the transaction's own method, else its latest payment's. */
function methodOf(e: Entry): { method: string | null; bank: string | null } {
  if (e.paymentMethod) return { method: e.paymentMethod, bank: e.bankName ?? null };
  const last = paymentsOf(e).at(-1);
  return last?.method ? { method: last.method, bank: last.bankName } : { method: null, bank: null };
}

/** Money moves in these types; spoilage and older owner-funded investments carry no payment. */
const hasPayment = (e: Entry) => e.type === "SALE" || e.type === "EXPENSE" || e.type === "CAPITAL" || e.type === "ASSET";

/** Shown where a column doesn't apply to a row, so a blank is never mistaken for missing data. */
function NA() {
  return <span className="font-semibold text-muted-foreground">N/A</span>;
}

/** An order's products and quantities, line by line. A single product is a list of one. */
function productLines(e: Entry): { name: string; qty: number | null }[] {
  if (e.lineItems?.length) return e.lineItems.map((l) => ({ name: l.name, qty: l.quantity }));
  return [{ name: e.sku ?? "", qty: e.type === "SALE" || e.type === "WASTE" ? e.quantity : null }];
}

/** The deadline of a receivable or payable, with where it stands. */
function Deadline({ e, action }: { e: Entry; action?: React.ReactNode }) {
  const now = new Date();
  const info = obligationInfo(e, now);
  const due = dueInfo(e, now);
  const bad = info.status === "overdue" || info.status === "defaulted";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={bad ? "font-semibold text-danger" : "font-semibold"}>{e.dueDate ? formatDate(e.dueDate) : "No date set"}</span>
      <span className={`text-[11.5px] ${bad ? "font-semibold text-danger" : "text-muted-foreground"}`}>
        {info.status === "settled"
          ? "Paid in full"
          : info.status === "defaulted"
            ? `Defaulted · ${formatPeso(info.remaining)} left`
            : `${formatPeso(info.remaining)} left${
                due.daysLeft === null
                  ? ""
                  : due.overdue
                    ? ` · ${Math.abs(due.daysLeft)} day${Math.abs(due.daysLeft) === 1 ? "" : "s"} overdue`
                    : due.daysLeft === 0
                      ? " · due today"
                      : ` · in ${due.daysLeft} day${due.daysLeft === 1 ? "" : "s"}`
              }`}
      </span>
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

const priceTypeOf = (e: Entry) => (e.type === "SALE" && e.priceType && e.priceType !== "standard" ? PRICE_TYPE_LABELS[e.priceType] : null);

/** Whether there is anything under an order that its rows don't already show. */
const hasDetails = (e: Entry, showPayment: boolean) =>
  priceTypeOf(e) !== null || Boolean(e.notes) || (showPayment && obligationKind(e) !== null);

/** What opens under an order: the price type, the payments on it, and a note. */
function Details({ e, showPayment, owed, onPay }: { e: Entry; showPayment: boolean; owed?: OwedActions; onPay: () => void }) {
  const kind = showPayment ? obligationKind(e) : null;
  const info = kind ? obligationInfo(e, new Date()) : null;
  const payments = kind ? paymentsOf(e) : [];
  const priceType = priceTypeOf(e);
  const faint = "text-muted-foreground";

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-[13px] min-[800px]:flex-row min-[800px]:flex-wrap min-[800px]:gap-x-12">
      {priceType && (
        <div>
          <span className="rounded-full bg-cacao/10 px-2 py-0.5 text-[11.5px] font-semibold text-cacao">{priceType} price</span>
        </div>
      )}

      {kind && info && (
        <div className="flex min-w-[260px] flex-col gap-1">
          {payments.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {payments.map((p, i) => (
                <li key={i} className="flex items-baseline justify-between gap-6">
                  <span className={faint}>
                    {formatDate(p.date)} · {describePaymentMethod(p.method, p.bankName) || "Not recorded"}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                  <span className="font-semibold tabular-nums">{formatPeso(p.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className={faint}>No payments yet.</span>
          )}
          {e.dueDateHistory?.map((c, i) => (
            <span key={`due-${i}`} className={faint}>
              Due date moved {c.from ? `from ${formatDate(c.from)} ` : ""}to {c.to ? formatDate(c.to) : "none"}
              {c.reason ? ` — ${c.reason}` : ""}
            </span>
          ))}
          {info.wasDefaulted && (
            <span className="font-semibold text-danger">
              Marked as defaulted{e.defaultedAt ? ` on ${formatDate(e.defaultedAt)}` : ""}
              {info.status === "settled" ? " — since paid in full" : ""}
            </span>
          )}
          {owed && info.status !== "settled" && (
            <div className="mt-1 flex flex-wrap gap-2">
              <button type="button" onClick={onPay} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line/25 px-3 text-[13px] font-medium transition hover:border-cacao hover:text-cacao">
                <Plus className="h-4 w-4" />
                Log Payment
              </button>
              <button type="button" onClick={() => owed.onMoveDue(e)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line/25 px-3 text-[13px] font-medium transition hover:border-cacao hover:text-cacao">
                Change due date
              </button>
              {info.status === "overdue" && (
                <button type="button" onClick={() => owed.onDefault(e)} className="inline-flex min-h-9 items-center rounded-lg border border-danger/40 px-3 text-[13px] font-medium text-danger transition hover:bg-danger/10">
                  Mark as defaulted
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {e.notes && <p className={`min-w-[260px] ${faint}`}>{e.notes}</p>}
    </div>
  );
}

/** What can be done to an owed row. Executives only. */
export interface OwedActions {
  /** A payment was saved: the message to tell the person. */
  onSaved: (message: string) => void;
  onDefault: (entry: Entry) => void;
  onMoveDue: (entry: Entry) => void;
}

export function TransactionTable({
  rows,
  showPayment,
  onEdit,
  carriedFrom,
  owed,
}: {
  rows: Entry[];
  /** Executives only — employees never see who owes what, or how anything was paid. */
  showPayment: boolean;
  onEdit: (entry: Entry) => void;
  /** For rows carried over from an earlier month: the month they come from, by id. */
  carriedFrom?: Map<string, string>;
  owed?: OwedActions;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // The order whose payment form is showing under its rows.
  const [paying, setPaying] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const val = (e: Entry) => (sort.key === "date" ? e.timestamp : sort.key === "due" ? (e.dueDate ?? "") : (e.amount ?? 0));
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, sort]);

  // A real table, sized to its contents, every cell centred under its heading. Long item and
  // name text wraps within a sensible width instead of stretching the table.
  const th = "whitespace-nowrap px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
  const td = "px-3 py-2 text-center align-middle";
  const colCount = showPayment ? 10 : 7;

  const head = (label: string, key?: SortKey) => (
    <th scope="col" className={th}>
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
    </th>
  );

  if (rows.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-muted-foreground">No transactions match. Try another filter or month.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="mx-auto w-full border-collapse text-[13px]">
        <thead className="border-b border-line/15 bg-secondary">
          <tr>
            {head("Date", "date")}
            {head("Customer / Supplier")}
            {head("Product")}
            {head("Qty")}
            {head("Amount", "amount")}
            {showPayment && head("Mode of payment")}
            {showPayment && head("Bank")}
            {showPayment && head("Deadline", "due")}
            {head("Recorded by")}
            <th scope="col" className={th}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e, i) => {
            const carried = carriedFrom?.get(e.id);
            const kind = obligationKind(e);
            const overdue = showPayment && !!kind && dueInfo(e, new Date()).overdue;
            const moneyIn = e.type === "SALE" || e.type === "CAPITAL";
            const { method, bank } = methodOf(e);
            const isOpen = open.has(e.id);
            const expandable = hasDetails(e, showPayment);
            const items = productLines(e);
            const toggle = () =>
              setOpen((prev) => {
                const next = new Set(prev);
                if (next.has(e.id)) next.delete(e.id);
                else next.add(e.id);
                return next;
              });
            return (
              <Fragment key={e.id}>
                <tr
                  onClick={expandable ? toggle : undefined}
                  aria-expanded={expandable ? isOpen : undefined}
                  className={`border-b border-line/5 ${overdue ? "bg-danger/[0.05]" : i % 2 === 0 ? "bg-card" : "bg-[#FBFAF7] dark:bg-secondary/30"} ${
                    expandable ? "cursor-pointer hover:brightness-[0.98]" : ""
                  }`}
                >
                  <td className={`${td} whitespace-nowrap`}>
                    <div>{formatDate(e.timestamp)}</div>
                    {carried && <div className="text-[11px] font-semibold text-[var(--status-warning)]">Carried from {carried}</div>}
                  </td>
                  <td className={`${td} max-w-[180px]`}>
                    <span className="line-clamp-2">{e.counterparty ?? <span className="text-muted-foreground">—</span>}</span>
                  </td>
                  <td
                    className={`${td} max-w-[240px] ${items.length > 1 ? "py-1" : ""}`}
                    title={items.map((l) => l.name).join(", ") + (e.type === "EXPENSE" && e.category ? ` · ${EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}` : "")}
                  >
                    {items.length === 1 ? (
                      <span className="line-clamp-2">{items[0].name || <span className="text-muted-foreground">—</span>}</span>
                    ) : (
                      // Several products: each in its own ruled slot, level with its quantity in the next column.
                      <ul className="divide-y divide-line/20">
                        {items.map((l, j) => (
                          <li key={j} className="h-8 truncate text-left leading-8">
                            {l.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className={`${td} tabular-nums ${items.length > 1 ? "py-1" : ""}`}>
                    {items.length === 1 ? (
                      items[0].qty != null ? items[0].qty : <span className="text-muted-foreground">—</span>
                    ) : (
                      <ul className="divide-y divide-line/20">
                        {items.map((l, j) => (
                          <li key={j} className="h-8 font-semibold leading-8">
                            {l.qty != null ? `× ${l.qty}` : "—"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className={`${td} whitespace-nowrap font-semibold tabular-nums ${e.type === "WASTE" ? "text-muted-foreground" : moneyIn ? "text-success" : "text-danger"}`}>
                    {e.amount == null ? (
                      <span className="font-normal text-muted-foreground">—</span>
                    ) : (
                      `${e.type === "WASTE" ? "" : moneyIn ? "+" : "−"}${formatPeso(e.amount)}`
                    )}
                  </td>
                  {showPayment && (
                    <td className={`${td} text-[12.5px]`}>
                      {!hasPayment(e) ? (
                        <NA />
                      ) : method ? (
                        <span
                          className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 font-semibold ${method === "bank_transfer" ? "bg-[#3F6E8C]/10 text-[#3F6E8C]" : "bg-secondary text-foreground"}`}
                        >
                          {method === "bank_transfer" ? "Bank transfer" : "Cash"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{kind ? "Not paid yet" : "—"}</span>
                      )}
                    </td>
                  )}
                  {showPayment && <td className={`${td} text-[12.5px]`}>{method === "bank_transfer" ? (bank ?? "—") : <NA />}</td>}
                  {showPayment && (
                    <td className={`${td} text-[12.5px]`}>
                      {kind ? (
                        <Deadline
                          e={e}
                          action={
                            owed && outstanding(e) > 0 ? (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setPaying(paying === e.id ? null : e.id);
                                }}
                                aria-label={kind === "receivable" ? "Log a payment received" : "Log a payment made"}
                                className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-cacao/10 px-3.5 text-[12.5px] font-semibold text-cacao transition hover:bg-cacao/20 active:scale-95"
                              >
                                <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
                                Log Payment
                              </button>
                            ) : undefined
                          }
                        />
                      ) : (
                        <NA />
                      )}
                    </td>
                  )}
                  <td className={`${td} whitespace-nowrap text-muted-foreground`}>{e.loggedByName ?? "—"}</td>
                  <td className="px-2 py-1 text-center align-middle">
                    <div className="flex items-center justify-center gap-0.5">
                      {showPayment && kind && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            toggle();
                          }}
                          aria-label={isOpen ? "Hide payment history" : "Show payment history"}
                          aria-expanded={isOpen}
                          title="Payment history"
                          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-secondary hover:text-cacao ${isOpen ? "bg-secondary text-cacao" : "text-muted-foreground"}`}
                        >
                          <HistoryIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onEdit(e);
                        }}
                        aria-label="Change this transaction"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-cacao"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                {paying === e.id && owed && kind && (
                  <tr className="border-b border-line/10 bg-secondary/40">
                    <td colSpan={colCount} className="text-left">
                      <QuickPay entry={e} kind={kind} remaining={outstanding(e)} onClose={() => setPaying(null)} onSaved={owed.onSaved} />
                    </td>
                  </tr>
                )}
                {isOpen && (
                  <tr className="border-b border-line/10 bg-secondary/40">
                    <td colSpan={colCount} className="text-left">
                      <Details e={e} showPayment={showPayment} owed={owed} onPay={() => setPaying(e.id)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
