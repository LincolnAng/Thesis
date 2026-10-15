"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { formatPeso } from "@/lib/format";
import { methodText } from "@/components/transactions/method-fields";
import {
  dayOf,
  STATUS_LABELS,
  VIEW_LABELS,
  inView,
  sortObligations,
  termsLabel,
  type CashMovement,
  type ObligationKind,
  type ObligationRow,
  type ObligationStatus,
  type ObligationView,
} from "@/lib/transactions/ledger";

const longDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

/** A section's heading with a plain-words line under it saying what the list is. */
export function SectionHead({ title, note, right }: { title: string; note: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-display text-[20px] font-semibold">{title}</h3>
        <p className="text-[13.5px] text-muted-foreground">{note}</p>
      </div>
      {right}
    </div>
  );
}

// ── Money that actually changed hands ──────────────────────────────────────

/**
 * Money Received / Money Paid. Every row is cash that really moved, on the day it did — a
 * payment against something owed shows what it was for and what is still left, so it is
 * clear this is the same debt being paid down rather than a second one.
 */
export function MovementList({
  rows,
  direction,
  onEdit,
  total,
}: {
  rows: CashMovement[];
  direction: "in" | "out";
  /** Open the sale or expense a spot movement came from. */
  onEdit?: (entryId: string) => void;
  total: number;
}) {
  const incoming = direction === "in";
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-line/15 bg-card px-5 py-8 text-center text-[14px] text-muted-foreground">
        {incoming ? "No money has been received in this time." : "No money has been paid out in this time."}
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-line/15 bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-[14px]">
          <thead className="bg-secondary/50 text-[12.5px] font-semibold text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-3 py-3">{incoming ? "Received from" : "Paid to"}</th>
              <th className="px-3 py-3">For</th>
              <th className="px-3 py-3 text-right">{incoming ? "Amount received" : "Amount paid"}</th>
              <th className="px-3 py-3">How</th>
              <th className="px-3 py-3">What it was for</th>
              <th className="px-3 py-3">Recorded by</th>
              {onEdit && (
                <th className="w-12 px-2 py-3">
                  <span className="sr-only">Edit</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-line/10">
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{longDate(m.date)}</td>
                <td className="px-3 py-3 font-semibold">{m.party ?? <span className="font-normal text-muted-foreground">—</span>}</td>
                <td className="max-w-[180px] truncate px-3 py-3 text-muted-foreground">{m.item ?? "—"}</td>
                <td className={`whitespace-nowrap px-3 py-3 text-right text-[15px] font-bold tabular-nums ${incoming ? "text-success" : "text-danger"}`}>
                  {incoming ? "+" : "−"}
                  {formatPeso(m.amount)}
                </td>
                <td className="px-3 py-3">{methodText(m.method, m.bankName)}</td>
                <td className="px-3 py-3 text-[13px]">
                  {m.against ? (
                    <>
                      Payment on {formatPeso(m.against.original)} {m.against.kind === "receivable" ? "owed to us" : "we owed"}
                      <br />
                      <span className={m.against.remainingAfter > 0 ? "text-muted-foreground" : "font-semibold text-success"}>
                        {m.against.remainingAfter > 0 ? `${formatPeso(m.against.remainingAfter)} still ${m.against.kind === "receivable" ? "owed" : "to pay"}` : "Paid in full"}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Paid on the spot</span>
                  )}
                </td>
                <td className="px-3 py-3 text-muted-foreground">{m.recordedByName ?? "—"}</td>
                {onEdit && (
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      onClick={() => onEdit(m.entryId)}
                      aria-label="Edit the transaction behind this"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-cacao"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between border-t border-line/10 bg-secondary/30 px-4 py-3 text-[14px]">
        <span className="font-semibold">Total {incoming ? "received" : "paid"} here</span>
        <span className={`font-bold tabular-nums ${incoming ? "text-success" : "text-danger"}`}>{formatPeso(total)}</span>
      </div>
    </div>
  );
}

// ── Money still owed ───────────────────────────────────────────────────────

const STATUS_STYLE: Record<ObligationStatus, string> = {
  unpaid: "border-line/40 text-foreground",
  partial: "border-[var(--status-warning)]/60 text-[var(--status-warning)]",
  due_today: "border-[var(--status-warning)] bg-[var(--status-warning)]/10 text-[var(--status-warning)]",
  overdue: "border-danger bg-danger/10 text-danger",
  defaulted: "border-danger bg-danger text-white",
  settled: "border-success/50 bg-success/10 text-success",
};

function StatusChip({ row }: { row: ObligationRow }) {
  const { status, partlyPaid, wasDefaulted } = row.info;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[12.5px] font-bold ${STATUS_STYLE[status]}`}>{STATUS_LABELS[status]}</span>
      {partlyPaid && status !== "partial" && <span className="text-[12px] font-semibold text-[var(--status-warning)]">Partly paid</span>}
      {status === "settled" && wasDefaulted && <span className="text-[12px] text-muted-foreground">Was defaulted</span>}
    </div>
  );
}

function dueText(row: ObligationRow): { main: string; sub: string | null; tone: string } {
  const { daysLeft, status } = row.info;
  if (status === "settled") return { main: row.entry.dueDate ? longDate(row.entry.dueDate) : "—", sub: null, tone: "" };
  if (!row.entry.dueDate || daysLeft === null) return { main: "No due date", sub: null, tone: "text-muted-foreground" };
  const date = longDate(row.entry.dueDate);
  if (daysLeft < 0) return { main: date, sub: `${Math.abs(daysLeft)} day${daysLeft === -1 ? "" : "s"} overdue`, tone: "text-danger" };
  if (daysLeft === 0) return { main: date, sub: "Due today", tone: "text-[var(--status-warning)]" };
  return { main: date, sub: `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, tone: "" };
}

/**
 * Still Owed to Us / We Still Owe. One row per receivable or payable — its original amount,
 * what has been paid, what is left, when it is due and its status — with the history of
 * payments and of any moved deadlines behind "History". The views above the list narrow it
 * to what needs attention; nothing here is ever counted as money received or paid.
 */
export function ObligationList({
  rows,
  kind,
  canAct,
  fromLabel,
  onPay,
  onDefault,
  onMoveDue,
  onEdit,
}: {
  rows: ObligationRow[];
  kind: ObligationKind;
  /** Executives only. */
  canAct: boolean;
  /** For an obligation made in an earlier month than the one being viewed: that month's name. */
  fromLabel: (row: ObligationRow) => string | null;
  onPay: (row: ObligationRow) => void;
  onDefault: (row: ObligationRow) => void;
  onMoveDue: (row: ObligationRow) => void;
  onEdit: (row: ObligationRow) => void;
}) {
  const [view, setView] = useState<ObligationView>("open");
  const [open, setOpen] = useState<string | null>(null);
  const incoming = kind === "receivable";

  const counts = Object.fromEntries(
    (Object.keys(VIEW_LABELS) as ObligationView[]).map((v) => [v, rows.filter((r) => inView(r, v)).length]),
  ) as Record<ObligationView, number>;
  const shown = sortObligations(rows.filter((r) => inView(r, view)));
  const owedTotal = shown.reduce((s, r) => s + r.info.remaining, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
        {(Object.keys(VIEW_LABELS) as ObligationView[]).map((v) => {
          const attention = (v === "overdue" || v === "defaulted") && counts[v] > 0;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`min-h-10 rounded-full border px-3.5 text-[13.5px] ${
                view === v
                  ? "border-cacao bg-cacao font-semibold text-ivory"
                  : attention
                    ? "border-danger/50 bg-card font-semibold text-danger"
                    : "border-line/20 bg-card"
              }`}
            >
              {VIEW_LABELS[v]} <span className="tabular-nums opacity-80">({counts[v]})</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-line/15 bg-card px-5 py-8 text-center text-[14px] text-muted-foreground">
          {view === "open"
            ? incoming
              ? "Nobody owes you anything right now."
              : "You don't owe anyone anything right now."
            : `Nothing under “${VIEW_LABELS[view]}”.`}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line/15 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[14px]">
              <thead className="bg-secondary/50 text-[12.5px] font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{incoming ? "Customer" : "Supplier"}</th>
                  <th className="px-3 py-3 text-right">Original amount</th>
                  <th className="px-3 py-3 text-right">{incoming ? "Received so far" : "Paid so far"}</th>
                  <th className="px-3 py-3 text-right">Still {incoming ? "owed to us" : "owed by us"}</th>
                  <th className="px-3 py-3">Due</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Terms</th>
                  <th className="px-3 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const e = row.entry;
                  const due = dueText(row);
                  const isOpen = open === e.id;
                  const from = fromLabel(row);
                  const settled = row.info.status === "settled";
                  return (
                    <Fragment key={e.id}>
                      <tr className={`border-t border-line/10 align-top ${row.info.status === "overdue" || row.info.status === "defaulted" ? "bg-danger/[0.04]" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{e.counterparty ?? <span className="font-normal text-muted-foreground">No name</span>}</div>
                          <div className="text-[12.5px] text-muted-foreground">
                            {e.sku ?? "—"} · {longDate(dayOf(e.timestamp))}
                          </div>
                          {from && <div className="text-[12px] font-semibold text-cacao">Carried over from {from}</div>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPeso(row.original)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPeso(row.info.paid)}</td>
                        <td className={`whitespace-nowrap px-3 py-3 text-right text-[15px] font-bold tabular-nums ${settled ? "text-muted-foreground" : incoming ? "text-success" : "text-danger"}`}>
                          {formatPeso(row.info.remaining)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <div>{due.main}</div>
                          {due.sub && <div className={`text-[12.5px] font-semibold ${due.tone}`}>{due.sub}</div>}
                        </td>
                        <td className="px-3 py-3">
                          <StatusChip row={row} />
                        </td>
                        <td className="px-3 py-3 text-[13px] text-muted-foreground">{termsLabel(e.paymentTerms)}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {canAct && !settled && (
                              <button
                                type="button"
                                onClick={() => onPay(row)}
                                className="min-h-10 rounded-[10px] bg-cacao px-3.5 text-[13.5px] font-semibold text-ivory"
                              >
                                {incoming ? "Record money received" : "Record a payment"}
                              </button>
                            )}
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              onClick={() => setOpen(isOpen ? null : e.id)}
                              className="flex min-h-10 items-center gap-1 rounded-[10px] border border-line/25 px-3 text-[13.5px] font-medium"
                            >
                              History {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-line/10 bg-secondary/30">
                          <td colSpan={8} className="px-4 py-4">
                            <ObligationHistory row={row} incoming={incoming} />
                            {canAct && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {!settled && (
                                  <button type="button" onClick={() => onMoveDue(row)} className="min-h-10 rounded-[10px] border border-line/25 bg-card px-3.5 text-[13.5px] font-medium">
                                    Change due date
                                  </button>
                                )}
                                {row.info.status === "overdue" && (
                                  <button
                                    type="button"
                                    onClick={() => onDefault(row)}
                                    className="min-h-10 rounded-[10px] border border-danger/50 bg-card px-3.5 text-[13.5px] font-semibold text-danger"
                                  >
                                    Mark as defaulted
                                  </button>
                                )}
                                <button type="button" onClick={() => onEdit(row)} className="min-h-10 rounded-[10px] border border-line/25 bg-card px-3.5 text-[13.5px] font-medium">
                                  Edit details
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {view !== "settled" && (
            <div className="flex justify-between border-t border-line/10 bg-secondary/30 px-4 py-3 text-[14px]">
              <span className="font-semibold">Total still {incoming ? "owed to us" : "owed by us"} in this list</span>
              <span className="font-bold tabular-nums">{formatPeso(owedTotal)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ObligationHistory({ row, incoming }: { row: ObligationRow; incoming: boolean }) {
  const { payments, entry } = row;
  const changes = entry.dueDateHistory ?? [];
  // What was left after each payment, worked out before rendering.
  const leftAfter = payments.map((_, i) => Math.max(0, Math.round((row.original - payments.slice(0, i + 1).reduce((t, p) => t + p.amount, 0)) * 100) / 100));
  return (
    <div className="grid grid-cols-1 gap-5 text-[13.5px] min-[900px]:grid-cols-2">
      <div>
        <p className="mb-1.5 font-semibold">{incoming ? "Money received" : "Payments made"} against this</p>
        {payments.length === 0 ? (
          <p className="text-muted-foreground">Nothing has been {incoming ? "received" : "paid"} yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {payments.map((p, i) => {
              const left = leftAfter[i];
              return (
                <li key={p.id} className="rounded-lg bg-card px-3 py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold tabular-nums">
                      {longDate(p.date)} · {formatPeso(p.amount)}
                    </span>
                    <span className="text-muted-foreground">{methodText(p.method, p.bankName)}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {left > 0 ? `${formatPeso(left)} still owed after this` : "Paid in full with this"}
                    {p.note ? ` · ${p.note}` : ""}
                    {p.recordedByName ? ` · by ${p.recordedByName}` : ""}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <p className="mb-1.5 font-semibold">Agreement</p>
          <p className="text-muted-foreground">
            {termsLabel(entry.paymentTerms)} · due {entry.dueDate ? longDate(entry.dueDate) : "no date set"}
          </p>
          {changes.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {changes.map((c, i) => (
                <li key={i} className="text-muted-foreground">
                  Moved from {c.from ? longDate(c.from) : "no date"} to {c.to ? longDate(c.to) : "no date"} on {longDate(c.changedAt.slice(0, 10))}
                  {c.reason ? ` — ${c.reason}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
        {entry.defaultedAt && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 font-medium text-danger">
            Marked as defaulted on {longDate(entry.defaultedAt.slice(0, 10))}.
            {row.info.status === "settled" ? " It has since been paid in full." : " It can still be paid."}
          </p>
        )}
      </div>
    </div>
  );
}
