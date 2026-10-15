"use client";

import { Fragment, useMemo, useState } from "react";
import { Banknote, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { EXPENSE_CATEGORY_LABELS, ENTRY_TYPE_LABELS, PRICE_TYPE_LABELS, describePaymentMethod, formatDate, formatPeso } from "@/lib/format";
import { dueInfo, obligationInfo, obligationKind, outstanding, paymentsOf } from "@/lib/transactions/ledger";
import { lineSubtotal, quantitySold } from "@/lib/transactions/order-lines";
import type { Entry } from "@/lib/store/types";

/**
 * Every recorded transaction, one row each, in one fixed set of columns — the same for sales,
 * expenses, receivables and payables, so what is owed reads exactly like what was paid:
 *
 *   Date · Customer / Supplier · Product · Amount · Mode of payment · Bank · Deadline · Recorded by
 *
 * Bank greys out when the payment wasn't a bank transfer, and Deadline when nothing is owed.
 * Only executives see the payment columns; an employee's copy has no payment data at all. The
 * arrow on a row opens its details (the products in an order, every payment made on it) and
 * the pencil opens the form that adds a transaction, which is where the money rules are
 * checked. Receivables and payables carry their own actions — record a payment, confirm a
 * default, move the due date. Tap a column heading to sort by it.
 */

type SortKey = "date" | "amount" | "due";

/** What the row is, in a word, shown under the product. */
function kindLabel(e: Entry): string {
  if (e.type === "WASTE") return "Spoilage";
  if (e.type === "CAPITAL") return "Capital put in";
  if (e.type === "ASSET") return "Asset";
  if (e.type === "RND") return "Investment";
  const owedKind = obligationKind(e);
  if (owedKind) return owedKind === "receivable" ? "Receivable" : "Payable";
  return ENTRY_TYPE_LABELS[e.type] ?? e.type;
}

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

/**
 * What a row can't show on its own. The row already carries the date, who, how much, how it was
 * paid and the deadline, so the receipt adds only: the products and their prices (when there is
 * more than one, or a price other than the regular one), the payments made on something owed, and
 * a note. A plain single-product sale has nothing to add, and its row has no arrow.
 */
interface ReceiptItem {
  name: string;
  qty: number | null;
  price: number | null;
  sub: number | null;
}

function receiptItems(e: Entry): ReceiptItem[] {
  if (e.lineItems?.length) return e.lineItems.map((l) => ({ name: l.name, qty: l.quantity, price: l.unitPrice, sub: lineSubtotal(l) }));
  if (e.type === "SALE" && e.priceType && e.priceType !== "standard" && e.sku) {
    const qty = e.quantity && e.quantity > 0 ? e.quantity : null;
    return [{ name: e.sku, qty, price: qty && e.amount != null ? Math.round((e.amount / qty) * 100) / 100 : null, sub: e.amount }];
  }
  return [];
}

const hasDetails = (e: Entry, showPayment: boolean) =>
  receiptItems(e).length > 0 || Boolean(e.notes) || (showPayment && obligationKind(e) !== null);

function Details({ e, showPayment, owed }: { e: Entry; showPayment: boolean; owed?: OwedActions }) {
  const items = receiptItems(e);
  const kind = showPayment ? obligationKind(e) : null;
  const info = kind ? obligationInfo(e, new Date()) : null;
  const payments = kind ? paymentsOf(e) : [];
  const priceType = e.type === "SALE" && e.priceType && e.priceType !== "standard" ? PRICE_TYPE_LABELS[e.priceType] : null;
  const faint = "text-muted-foreground";

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-[13px] min-[800px]:flex-row min-[800px]:flex-wrap min-[800px]:gap-x-12">
      {items.length > 0 && (
        <div className="flex min-w-[260px] flex-col gap-1">
          {priceType && (
            <span className="w-fit rounded-full bg-cacao/10 px-2 py-0.5 text-[11.5px] font-semibold text-cacao">{priceType} price</span>
          )}
          <ul className="flex flex-col gap-0.5">
            {items.map((l, i) => (
              <li key={i} className="flex items-baseline justify-between gap-6">
                <span>
                  {l.name}
                  <span className={faint}>
                    {l.qty != null ? ` × ${l.qty}` : ""}
                    {l.price != null ? ` at ${formatPeso(l.price)}` : ""}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{l.sub != null ? formatPeso(l.sub) : ""}</span>
              </li>
            ))}
          </ul>
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
              <button type="button" onClick={() => owed.onPay(e)} className="min-h-10 rounded-lg bg-cacao px-4 text-[13px] font-semibold text-ivory">
                Record a payment
              </button>
              <button type="button" onClick={() => owed.onMoveDue(e)} className="min-h-10 rounded-lg border border-line/25 px-4 text-[13px] font-semibold">
                Change due date
              </button>
              {info.status === "overdue" && (
                <button type="button" onClick={() => owed.onDefault(e)} className="min-h-10 rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger">
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
  const colCount = showPayment ? 9 : 6;

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
            const qty = quantitySold(e);
            const { method, bank } = methodOf(e);
            const isOpen = open.has(e.id);
            return (
              <Fragment key={e.id}>
                <tr className={`border-b border-line/5 ${overdue ? "bg-danger/[0.05]" : i % 2 === 0 ? "bg-card" : "bg-[#FBFAF7] dark:bg-secondary/30"}`}>
                  <td className={`${td} whitespace-nowrap`}>
                    <div>{formatDate(e.timestamp)}</div>
                    {carried && <div className="text-[11px] font-semibold text-[var(--status-warning)]">Carried from {carried}</div>}
                  </td>
                  <td className={`${td} max-w-[180px]`}>
                    <span className="line-clamp-2">{e.counterparty ?? <span className="text-muted-foreground">—</span>}</span>
                  </td>
                  <td className={`${td} max-w-[220px]`} title={e.sku ?? ""}>
                    {e.lineItems?.length ? (
                      <span>
                        <span className="font-semibold">{e.lineItems.length} products</span>
                        <span className="block truncate text-[12px] text-muted-foreground">{e.lineItems.map((l) => l.name).join(", ")}</span>
                      </span>
                    ) : (
                      <span className="line-clamp-2">{e.sku ?? <span className="text-muted-foreground">—</span>}</span>
                    )}
                    <span className="block text-[11.5px] text-muted-foreground">
                      {kindLabel(e)}
                      {e.type === "SALE" && e.priceType ? ` · ${PRICE_TYPE_LABELS[e.priceType] ?? e.priceType} price` : ""}
                      {qty != null ? ` · ${qty} sold` : ""}
                      {e.type === "EXPENSE" && e.category ? ` · ${EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}` : ""}
                    </span>
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
                  {showPayment && (
                    <td className={`${td} text-[12.5px]`}>{method === "bank_transfer" ? (bank ?? "—") : <NA />}</td>
                  )}
                  {showPayment && (
                    <td className={`${td} text-[12.5px]`}>{kind ? <Deadline e={e} /> : <NA />}</td>
                  )}
                  <td className={`${td} whitespace-nowrap text-muted-foreground`}>{e.loggedByName ?? "—"}</td>
                  <td className="px-1 py-1 text-center align-middle">
                    <div className="flex items-center justify-center gap-0.5">
                      {hasDetails(e, showPayment) && (
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
                      {owed && kind && outstanding(e) > 0 && (
                        <button
                          type="button"
                          onClick={() => owed.onPay(e)}
                          aria-label={kind === "receivable" ? "Record money received" : "Record a payment made"}
                          title="Record a payment"
                          className="flex h-11 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-cacao"
                        >
                          <Banknote className="h-4 w-4" />
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
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-line/10 bg-secondary/40">
                    <td colSpan={colCount} className="text-left">
                      <Details e={e} showPayment={showPayment} owed={owed} />
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
