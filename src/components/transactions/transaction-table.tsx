"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, HandCoins, Pencil } from "lucide-react";
import { EXPENSE_CATEGORY_LABELS, PRICE_TYPE_LABELS, describePaymentMethod, formatDate, formatPeso } from "@/lib/format";
import { dueInfo, obligationInfo, obligationKind, outstanding, paymentsOf } from "@/lib/transactions/ledger";
import { expandOrderLines } from "@/lib/transactions/order-lines";
import type { Entry } from "@/lib/store/types";

/**
 * Every recorded transaction, in one fixed set of columns — the same for sales, expenses,
 * receivables and payables, so what is owed reads exactly like what was paid:
 *
 *   Date · Customer / Supplier · Product · Qty · Amount · Mode of payment · Bank · Deadline · Recorded by
 *
 * One row per product. An order of several products is several rows, each with its own product,
 * quantity and share of the amount, and the customer's name on every one. The deadline (and what
 * is left to pay) and the action buttons are one cell spanning the order's rows, centred, so a
 * balance isn't counted per product. Rows of one order are striped together so they read as
 * one block.
 *
 * Only executives see the payment columns; an employee's copy has no payment data at all. The
 * arrow opens what the row can't show (payments on something owed, the price type, a note) and
 * the pencil opens the form that adds a transaction, which is where the money rules are
 * checked. Receivables and payables carry their own actions — record a payment, confirm a
 * default, move the due date. Tap a column heading to sort by it.
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

/** The deadline of a receivable or payable, with where it stands. */
function Deadline({ e }: { e: Entry }) {
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
    </div>
  );
}

const priceTypeOf = (e: Entry) => (e.type === "SALE" && e.priceType && e.priceType !== "standard" ? PRICE_TYPE_LABELS[e.priceType] : null);

/** Whether there is anything under an order that its rows don't already show. */
const hasDetails = (e: Entry, showPayment: boolean) =>
  priceTypeOf(e) !== null || Boolean(e.notes) || (showPayment && obligationKind(e) !== null);

/** What opens under an order: the price type, the payments on it, and a note. */
function Details({ e, showPayment, owed }: { e: Entry; showPayment: boolean; owed?: OwedActions }) {
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
              <button type="button" onClick={() => owed.onPay(e)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line/25 px-3 text-[13px] font-medium transition hover:border-cacao hover:text-cacao">
                <HandCoins className="h-4 w-4" />
                Add payment
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
  onPay: (entry: Entry) => void;
  onDefault: (entry: Entry) => void;
  onMoveDue: (entry: Entry) => void;
}

/** One product's row: the transaction it belongs to, its own product/quantity/amount, and where it sits in the order. */
interface ProductRow {
  key: string;
  origin: Entry;
  row: Entry;
  first: boolean;
  last: boolean;
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

  // Orders are sorted as a whole, then opened out into their products.
  const groups = useMemo(() => {
    let ordered = rows;
    if (sort) {
      const val = (e: Entry) => (sort.key === "date" ? e.timestamp : sort.key === "due" ? (e.dueDate ?? "") : (e.amount ?? 0));
      ordered = [...rows].sort((a, b) => {
        const x = val(a);
        const y = val(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
    }
    return ordered.map((origin) => {
      const expanded = expandOrderLines([origin]);
      return expanded.map<ProductRow>((row, i) => ({ key: row.id, origin, row, first: i === 0, last: i === expanded.length - 1 }));
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
          {groups.map((group, gi) => {
            const origin = group[0].origin;
            const carried = carriedFrom?.get(origin.id);
            const kind = obligationKind(origin);
            const overdue = showPayment && !!kind && dueInfo(origin, new Date()).overdue;
            const moneyIn = origin.type === "SALE" || origin.type === "CAPITAL";
            const { method, bank } = methodOf(origin);
            const isOpen = open.has(origin.id);
            const stripe = overdue ? "bg-danger/[0.05]" : gi % 2 === 0 ? "bg-card" : "bg-[#FBFAF7] dark:bg-secondary/30";
            return (
              <Fragment key={origin.id}>
                {group.map(({ key, row, first, last }) => (
                  // Rows of one order share a stripe and only the last carries a rule, so they read as a block.
                  <tr key={key} className={`${stripe} ${last ? "border-b border-line/5" : ""}`}>
                    <td className={`${td} whitespace-nowrap`}>
                      <div>{formatDate(row.timestamp)}</div>
                      {first && carried && <div className="text-[11px] font-semibold text-[var(--status-warning)]">Carried from {carried}</div>}
                    </td>
                    <td className={`${td} max-w-[180px]`}>
                      <span className="line-clamp-2">{row.counterparty ?? <span className="text-muted-foreground">—</span>}</span>
                    </td>
                    <td
                      className={`${td} max-w-[220px]`}
                      title={row.type === "EXPENSE" && row.category ? `${row.sku ?? ""} · ${EXPENSE_CATEGORY_LABELS[row.category] ?? row.category}` : (row.sku ?? "")}
                    >
                      <span className="line-clamp-2">{row.sku ?? <span className="text-muted-foreground">—</span>}</span>
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {row.quantity != null && (row.type === "SALE" || row.type === "WASTE") ? row.quantity : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td
                      className={`${td} whitespace-nowrap font-semibold tabular-nums ${row.type === "WASTE" ? "text-muted-foreground" : moneyIn ? "text-success" : "text-danger"}`}
                    >
                      {row.amount == null ? (
                        <span className="font-normal text-muted-foreground">—</span>
                      ) : (
                        `${row.type === "WASTE" ? "" : moneyIn ? "+" : "−"}${formatPeso(row.amount)}`
                      )}
                    </td>
                    {showPayment && (
                      <td className={`${td} text-[12.5px]`}>
                        {!hasPayment(origin) ? (
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
                    {/* The deadline and the actions belong to the whole order: one cell spanning its rows, centred. */}
                    {showPayment && first && (
                      <td rowSpan={group.length} className={`${td} text-[12.5px]`}>
                        {kind ? <Deadline e={origin} /> : <NA />}
                      </td>
                    )}
                    <td className={`${td} whitespace-nowrap text-muted-foreground`}>{row.loggedByName ?? "—"}</td>
                    {first && (
                      <td rowSpan={group.length} className="px-2 py-1 text-center align-middle">
                        <div className="flex flex-col items-center gap-1">
                          {owed && kind && outstanding(origin) > 0 && (
                            <button
                              type="button"
                              onClick={() => owed.onPay(origin)}
                              aria-label={kind === "receivable" ? "Add a payment received" : "Add a payment made"}
                              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line/20 px-2.5 text-[12px] font-medium text-muted-foreground transition hover:border-cacao hover:text-cacao active:scale-[0.97]"
                            >
                              <HandCoins className="h-3.5 w-3.5" />
                              Add payment
                            </button>
                          )}
                          <div className="flex items-center justify-center gap-0.5">
                            {hasDetails(origin, showPayment) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpen((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(origin.id)) next.delete(origin.id);
                                    else next.add(origin.id);
                                    return next;
                                  })
                                }
                                aria-expanded={isOpen}
                                aria-label={isOpen ? "Hide details" : "Show details"}
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-cacao"
                              >
                                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onEdit(origin)}
                              aria-label="Change this transaction"
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-cacao"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {isOpen && (
                  <tr className="border-b border-line/10 bg-secondary/40">
                    <td colSpan={colCount} className="text-left">
                      <Details e={origin} showPayment={showPayment} owed={owed} />
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
