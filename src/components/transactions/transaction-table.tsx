"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, HandCoins, History as HistoryIcon, Pencil } from "lucide-react";
import { ENTRY_TYPE_LABELS, EXPENSE_CATEGORY_LABELS, PRICE_TYPE_LABELS, formatDate, formatPeso } from "@/lib/format";
import { dueInfo, methodOf, obligationInfo, obligationKind, outstanding, paymentsOf } from "@/lib/transactions/ledger";
import { lineSubtotal, orderTotal } from "@/lib/transactions/order-lines";
import { PaymentLine, QuickPay } from "@/components/transactions/obligation-dialogs";
import type { Entry } from "@/lib/store/types";

/**
 * Every recorded transaction, one row each, in one fixed set of columns — the same for sales,
 * expenses, receivables and payables:
 *
 *   Date · Customer / Supplier · Type · Product · Qty · Amount · Mode of payment · Status · Recorded by
 *
 * Every cell is centred and ruled off from the next. Mode of payment is how the money moved —
 * Cash, or the bank or wallet it went through (BDO, GCash).
 *
 * Status is one pill: green Paid, yellow Partially Paid (or Unpaid, Due today) with what is left
 * written small beneath it, soft red Overdue or Defaulted. Amounts stay plain dark text — the pill
 * carries the money's state. A row with a balance still owed has a quiet "Log Payment" button.
 * Cells that don't apply are simply blank.
 *
 * An order of several products is still one row, listing every product one per line with its
 * quantity on the same line in Qty. Opening the row adds each product's share of the amount.
 *
 * Receivables and payables have a history button beside the pencil: it opens the due date, each
 * payment (date, how, amount), each time the deadline moved and a default, with the actions to log
 * a payment, change the due date or mark a default. Only executives see Status; an employee's
 * copy has no payment data at all. The pencil opens the form that adds a transaction, which is
 * where the money rules are checked. Tap a column heading to sort by it.
 */

type SortKey = "date" | "amount";

/** Money moves in these types; spoilage and older owner-funded investments carry no payment. */
const hasPayment = (e: Entry) => e.type === "SALE" || e.type === "EXPENSE" || e.type === "CAPITAL" || e.type === "ASSET";

interface ProductLine {
  name: string;
  qty: number | null;
  /** This product's share of what the order came to, so the lines add back to the amount. */
  amount: number | null;
}

/** An order's products, line by line. A single product is a list of one. */
function productLines(e: Entry): ProductLine[] {
  if (e.lineItems?.length) {
    const listed = orderTotal(e.lineItems);
    const actual = e.amount ?? listed;
    return e.lineItems.map((l) => ({
      name: l.name,
      qty: l.quantity,
      amount: listed > 0 ? Math.round((lineSubtotal(l) / listed) * actual * 100) / 100 : 0,
    }));
  }
  return [{ name: e.sku ?? "", qty: e.type === "SALE" || e.type === "WASTE" ? e.quantity : null, amount: e.amount }];
}

/** Where a receivable or payable stands against its due date, in words. */
function dueLine(e: Entry): string {
  const due = dueInfo(e, new Date());
  if (!e.dueDate || due.daysLeft === null) return "No due date set";
  const when = due.overdue
    ? `${Math.abs(due.daysLeft)} day${Math.abs(due.daysLeft) === 1 ? "" : "s"} overdue`
    : due.daysLeft === 0
      ? "due today"
      : `in ${due.daysLeft} day${due.daysLeft === 1 ? "" : "s"}`;
  return `Due ${formatDate(e.dueDate)} · ${when}`;
}

/**
 * How the money actually moved: cash, or a bank transfer and which bank. A receivable or payable
 * lists each way its payments came in (nothing until one has); anything else, how it was paid.
 */
function paidBy(e: Entry, showPayment: boolean): { method: string; bank: string | null }[] {
  if (!showPayment || !hasPayment(e)) return [];
  if (obligationKind(e)) {
    const seen = new Map<string, { method: string; bank: string | null }>();
    for (const p of paymentsOf(e)) if (p.method) seen.set(`${p.method}|${p.bankName ?? ""}`, { method: p.method, bank: p.bankName ?? null });
    return [...seen.values()];
  }
  return e.paymentMethod ? [{ method: e.paymentMethod, bank: e.bankName ?? null }] : [];
}

/** What kind of transaction a row is, in one word. */
function typeLabel(e: Entry): string {
  switch (e.type) {
    case "SALE":
      return "Sale";
    case "EXPENSE":
      return "Expense";
    case "CAPITAL":
    case "ASSET":
    case "RND":
      return "Investment";
    case "WASTE":
      return "Spoilage";
    default:
      return ENTRY_TYPE_LABELS[e.type] ?? e.type;
  }
}

type Tone = "good" | "warn" | "bad";

const PILL: Record<Tone, string> = {
  good: "bg-success/10 text-success",
  warn: "bg-[var(--status-warning)]/10 text-[var(--status-warning)]",
  bad: "bg-danger/10 text-danger",
};

/** The one pill that says where a transaction's money stands, and what is still left. */
function statusOf(e: Entry, showPayment: boolean): { label: string; tone: Tone; left: number } | null {
  if (!showPayment || !hasPayment(e)) return null;
  if (!obligationKind(e)) return { label: "Paid", tone: "good", left: 0 };
  const info = obligationInfo(e, new Date());
  const left = info.remaining;
  switch (info.status) {
    case "settled":
      return { label: "Paid", tone: "good", left: 0 };
    case "partial":
      return { label: "Partially Paid", tone: "warn", left };
    case "due_today":
      return { label: "Due today", tone: "warn", left };
    case "overdue":
      return { label: "Overdue", tone: "bad", left };
    case "defaulted":
      return { label: "Defaulted", tone: "bad", left };
    default:
      return { label: "Unpaid", tone: "warn", left };
  }
}

const priceTypeOf = (e: Entry) => (e.type === "SALE" && e.priceType && e.priceType !== "standard" ? PRICE_TYPE_LABELS[e.priceType] : null);

/** Whether there is anything under an order that its rows don't already show. */
const hasDetails = (e: Entry, showPayment: boolean) =>
  productLines(e).length > 1 || priceTypeOf(e) !== null || Boolean(e.notes) || (showPayment && hasPayment(e) && (obligationKind(e) !== null || methodOf(e).method !== null));

/** A titled block in an opened row. */
function Block({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 border-b border-line/15 pb-1.5">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * What opens under an order, as two even columns: on the left the products (name, quantity, its
 * share of the amount), the price type and the transaction's note; on the right the payments —
 * the due date, each payment with its note, and what can be done next.
 */
function Details({
  e,
  showPayment,
  owed,
  paying,
  onPay,
  onClosePay,
}: {
  e: Entry;
  showPayment: boolean;
  owed?: OwedActions;
  /** The new-payment line is open at the end of the history. */
  paying: boolean;
  onPay: () => void;
  onClosePay: () => void;
}) {
  const kind = showPayment ? obligationKind(e) : null;
  const info = kind ? obligationInfo(e, new Date()) : null;
  const payments = kind ? paymentsOf(e) : [];
  const priceType = priceTypeOf(e);
  const faint = "text-muted-foreground";
  const items = productLines(e);
  const spot = showPayment && !kind && hasPayment(e) ? methodOf(e) : null;
  const button = "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line/25 px-3 text-[13px] font-medium transition hover:border-cacao hover:text-cacao";

  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-5 px-5 py-4 text-[13px] min-[900px]:grid-cols-2">
      <div className="flex flex-col gap-5">
        <Block title={items.length > 1 ? `Products · ${items.length}` : "Product"} aside={priceType && <span className="rounded-full bg-cacao/10 px-2 py-0.5 text-[11px] font-semibold text-cacao">{priceType} price</span>}>
          <ul className="flex flex-col">
            {items.map((l, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_48px_88px] items-center gap-x-4 py-1">
                <span className="truncate">{l.name || "—"}</span>
                <span className={`text-right tabular-nums ${faint}`}>{l.qty != null ? `× ${l.qty}` : ""}</span>
                <span className="text-right font-semibold tabular-nums">{l.amount != null ? formatPeso(l.amount) : ""}</span>
              </li>
            ))}
          </ul>
        </Block>
        {e.notes && (
          <Block title="Note">
            <p className="whitespace-pre-wrap">{e.notes}</p>
          </Block>
        )}
      </div>

      {kind && info ? (
        <Block
          title="Payments"
          aside={<span className={`text-[12.5px] ${info.status === "overdue" || info.status === "defaulted" ? "font-semibold text-danger" : faint}`}>{dueLine(e)}</span>}
        >
          {payments.length > 0 || (paying && owed) ? (
            <ul className="flex flex-col">
              {payments.map((p) => (
                <PaymentLine key={p.id} entry={e} payment={p} canChange={!!owed} onChanged={(m) => owed?.onSaved(m)} />
              ))}
              {paying && owed && kind && <QuickPay entry={e} kind={kind} remaining={outstanding(e)} onClose={onClosePay} onSaved={owed.onSaved} />}
            </ul>
          ) : (
            <p className={`py-1 ${faint}`}>No payments yet.</p>
          )}
          {e.dueDateHistory?.map((c, i) => (
            <p key={`due-${i}`} className={faint}>
              Due date moved {c.from ? `from ${formatDate(c.from)} ` : ""}to {c.to ? formatDate(c.to) : "none"}
              {c.reason ? ` — ${c.reason}` : ""}
            </p>
          ))}
          {info.wasDefaulted && (
            <p className="font-semibold text-danger">
              Marked as defaulted{e.defaultedAt ? ` on ${formatDate(e.defaultedAt)}` : ""}
              {info.status === "settled" ? " — since paid in full" : ""}
            </p>
          )}
          {owed && info.status !== "settled" && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button type="button" onClick={onPay} disabled={paying} className={`${button} disabled:opacity-40`}>
                <HandCoins className="h-4 w-4" />
                Log Payment
              </button>
              <button type="button" onClick={() => owed.onMoveDue(e)} className={button}>
                Change due date
              </button>
              {info.status === "overdue" && (
                <button type="button" onClick={() => owed.onDefault(e)} className="inline-flex min-h-9 items-center rounded-lg border border-danger/40 px-3 text-[13px] font-medium text-danger transition hover:bg-danger/10">
                  Mark as defaulted
                </button>
              )}
            </div>
          )}
        </Block>
      ) : spot?.method ? (
        <Block title="Payment">
          <p className="py-1">
            Paid on the spot · {spot.method === "bank_transfer" ? `Bank transfer${spot.bank ? ` · ${spot.bank}` : ""}` : "Cash"}
          </p>
        </Block>
      ) : null}
    </div>
  );
}

/** One action in a row: an icon with its name under it. Shaded out, not hidden, when it doesn't apply. */
function ActionIcon({
  icon: Icon,
  label,
  title,
  enabled,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
  enabled: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        if (enabled) onClick();
      }}
      disabled={!enabled}
      aria-label={title}
      aria-pressed={active}
      title={title}
      className={`flex w-12 flex-col items-center gap-0.5 rounded-lg py-1 text-[10.5px] font-semibold transition ${
        !enabled
          ? "cursor-not-allowed text-muted-foreground/30"
          : active
            ? "bg-secondary text-cacao"
            : "text-muted-foreground hover:bg-secondary hover:text-cacao"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

/** What can be done to an owed row. Executives only. */
export interface OwedActions {
  /** A payment was saved, corrected or taken back: the message to tell the person, and — right
   *  after a new one — a way to take it back. */
  onSaved: (message: string, undo?: () => Promise<string>) => void;
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
    const val = (e: Entry) => (sort.key === "date" ? e.timestamp : (e.amount ?? 0));
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, sort]);

  // A real table, every cell centred under its heading and ruled off from its neighbours. Its
  // columns are set widths, not sized to whatever rows are showing, so changing the month, the
  // filter or the sort, or opening a row, never shifts a column: the frame stays put and only
  // its contents change. Product takes whatever width is left; long text is cut off with "…".
  const rule = "border-r border-line/15 last:border-r-0";
  const th = `px-3 py-2.5 text-center text-[11px] font-bold uppercase leading-tight tracking-wide text-muted-foreground ${rule}`;
  const td = `px-3 py-3 text-center align-middle ${rule}`;
  const colCount = showPayment ? 10 : 8;

  const widths = [108, 140, 96, null, 52, 100, ...(showPayment ? [104, 156] : []), 92, showPayment ? 164 : 80];

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
      <table className={`w-full table-fixed border-collapse text-[13px] ${showPayment ? "min-w-[1150px]" : "min-w-[820px]"}`}>
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={w ? { width: w } : undefined} />
          ))}
        </colgroup>
        <thead className="border-b border-line/15 bg-secondary">
          <tr>
            {head("Date", "date")}
            {head("Customer / Supplier")}
            {head("Type")}
            {head("Product")}
            {head("Qty")}
            {head("Amount", "amount")}
            {showPayment && head("Mode of payment")}
            {showPayment && head("Status")}
            {head("Recorded by")}
            {head("Actions")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const carried = carriedFrom?.get(e.id);
            const kind = obligationKind(e);
            const { method, bank } = methodOf(e);
            const isOpen = open.has(e.id);
            const expandable = hasDetails(e, showPayment);
            const items = productLines(e);
            const status = statusOf(e, showPayment);
            const canPay = !!owed && !!kind && !!status && status.left > 0;
            const payTip = method === "bank_transfer" ? `Bank transfer${bank ? ` · ${bank}` : ""}` : method ? "Cash" : undefined;
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
                  className={`group border-b border-line/20 bg-card ${expandable ? "cursor-pointer hover:bg-secondary/40" : ""}`}
                >
                  <td className={`${td} whitespace-nowrap`}>{formatDate(e.timestamp)}</td>
                  <td className={td} title={e.counterparty ?? undefined}>
                    <span className="block truncate font-medium">{e.counterparty}</span>
                    {carried && <div className="text-[11px] font-semibold text-[var(--status-warning)]">Carried from {carried}</div>}
                  </td>
                  <td className={`${td} truncate`}>{typeLabel(e)}</td>
                  {/* Every product in the order, one per line, each with its own quantity on the same line next door. */}
                  <td
                    className={td}
                    title={items.map((l) => l.name).join(", ") + (e.type === "EXPENSE" && e.category ? ` · ${EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}` : "")}
                  >
                    {items.map((l, j) => (
                      <span key={j} className="block truncate leading-6">
                        {l.name}
                      </span>
                    ))}
                  </td>
                  <td className={`${td} tabular-nums`}>
                    {items.map((l, j) => (
                      <span key={j} className="block leading-6">
                        {l.qty ?? "\u00a0"}
                      </span>
                    ))}
                  </td>
                  <td className={`${td} whitespace-nowrap tabular-nums ${e.type === "WASTE" ? "text-muted-foreground" : "text-foreground"}`}>
                    {e.amount != null ? formatPeso(e.amount) : null}
                  </td>
                  {showPayment && (
                    <td className={td}>
                      {paidBy(e, showPayment).map((m) => (
                        <span key={`${m.method}${m.bank}`} className="block truncate leading-6" title={m.method === "bank_transfer" ? `Bank transfer${m.bank ? ` · ${m.bank}` : ""}` : undefined}>
                          {m.method === "bank_transfer" ? (m.bank ?? "Bank transfer") : "Cash"}
                        </span>
                      ))}
                    </td>
                  )}
                  {showPayment && (
                    <td className={td}>
                      {status && (
                        <div className="flex flex-col items-center gap-1">
                          <span
                            title={payTip}
                            className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${PILL[status.tone]}`}
                          >
                            {status.label}
                          </span>
                          {kind && (
                            <span
                              title={kind === "receivable" ? "A receivable: a customer owes us" : "A payable: we owe a supplier"}
                              className={`flex items-center gap-1 whitespace-nowrap text-[12px] tabular-nums ${kind === "receivable" ? "text-success" : "text-danger"}`}
                            >
                              {kind === "receivable" ? <ArrowDownLeft className="h-3 w-3" strokeWidth={2.4} /> : <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />}
                              {status.left > 0
                                ? `${formatPeso(status.left)} ${kind === "receivable" ? "to collect" : "to pay"}`
                                : kind === "receivable"
                                  ? "Collected"
                                  : "Paid out"}
                            </span>
                          )}
                          {kind && paymentsOf(e).length > 0 && (
                            <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                              {paymentsOf(e).length > 1 ? "Last paid" : "Paid"} {formatDate(paymentsOf(e).at(-1)!.date)}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                  <td className={`${td} truncate`} title={e.loggedByName ?? undefined}>
                    {e.loggedByName}
                  </td>
                  {/* The same three actions in the same places on every row; one that doesn't apply is shaded out. */}
                  <td className="px-2 py-1.5 text-center align-middle">
                    <div className="flex items-start justify-center gap-0.5">
                      {showPayment && (
                        <ActionIcon
                          icon={HandCoins}
                          label="Payment"
                          title={canPay ? (kind === "receivable" ? "Log a payment received" : "Log a payment made") : kind ? "Nothing left to pay" : "Paid on the spot — nothing owed"}
                          enabled={canPay}
                          active={paying === e.id}
                          onClick={() => {
                            if (paying === e.id) return setPaying(null);
                            setPaying(e.id);
                            setOpen((prev) => new Set(prev).add(e.id));
                          }}
                        />
                      )}
                      {showPayment && (
                        <ActionIcon
                          icon={HistoryIcon}
                          label="History"
                          title={kind ? (isOpen ? "Hide payment history" : "Show payment history") : "No payment history — it wasn't owed"}
                          enabled={!!kind}
                          active={isOpen}
                          onClick={toggle}
                        />
                      )}
                      <ActionIcon icon={Pencil} label="Edit" title="Change this transaction" enabled onClick={() => onEdit(e)} />
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-line/10 bg-secondary/40">
                    <td colSpan={colCount} className="text-left">
                      <Details e={e} showPayment={showPayment} owed={owed} paying={paying === e.id} onPay={() => setPaying(e.id)} onClosePay={() => setPaying(null)} />
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
