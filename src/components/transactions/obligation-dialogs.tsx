"use client";

import { useState } from "react";
import {
  BanknoteArrowDown,
  BanknoteArrowUp,
  CalendarCheck,
  CalendarDays,
  Check,
  CircleCheck,
  CircleDot,
  Hourglass,
  Package,
  Receipt,
  StickyNote,
  Store,
  TriangleAlert,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChipGroup } from "@/components/ui/chip-group";
import { MethodFields } from "@/components/transactions/method-fields";
import { formatDate, formatPeso } from "@/lib/format";
import { markDefaulted, moveDueDate, recordPaymentOn } from "@/lib/transactions/actions";
import { PAYMENT_TERMS, addDays, dayOf, dueFromTerms, obligationInfo, termsLabel, todayOf, type ObligationKind } from "@/lib/transactions/ledger";
import type { Entry } from "@/lib/store/types";

const WORDS: Record<ObligationKind, { who: string; money: string; verb: string; done: string }> = {
  receivable: { who: "Customer", money: "received", verb: "Record money received", done: "Received" },
  payable: { who: "Supplier", money: "paid", verb: "Record a payment", done: "Paid" },
};

function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
      {text}
    </p>
  );
}

/**
 * A payment against something already owed. It never creates a second receivable or payable:
 * the amount is added to that one's history and the balance drops by exactly that much.
 *
 * Laid out in the order a person thinks it through: what is this (who, what, how much of it is
 * left), how much came in, when, how, and then record it. The amount starts at the whole
 * balance — the common case — with one tap for half, and the line under it says what will be
 * left, so there is nothing to work out.
 */
export function RecordPaymentDialog({
  entry,
  kind,
  remaining,
  onClose,
  onSaved,
}: {
  entry: Entry;
  kind: ObligationKind;
  remaining: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const w = WORDS[kind];
  const incoming = kind === "receivable";
  const total = entry.amount ?? 0;
  const paidBefore = Math.max(0, Math.round((total - remaining) * 100) / 100);
  const pct = total > 0 ? Math.min(100, (paidBefore / total) * 100) : 0;
  const today = todayOf(new Date());
  const yesterday = addDays(today, -1);
  const earliest = dayOf(entry.timestamp);

  const [amount, setAmount] = useState(String(remaining));
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<string | null>("cash");
  const [bankName, setBankName] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const typed = Number(amount.replace(/[^0-9.]/g, ""));
  const valid = Number.isFinite(typed) && typed > 0;
  const leftAfter = valid ? Math.max(0, Math.round((remaining - typed) * 100) / 100) : remaining;
  const bankMissing = method === "bank_transfer" && !bankName?.trim();
  const who = entry.counterparty ?? w.who;

  const problem = !valid
    ? null
    : typed > remaining + 0.005
      ? `That's more than the ${formatPeso(remaining)} still owed.`
      : !date
        ? "Pick the day the money changed hands."
        : date > today
          ? "The date can't be in the future."
          : date < earliest
            ? `The date can't be before the transaction (${formatDate(earliest)}).`
            : bankMissing
              ? "Pick or type the bank to save this."
              : null;

  async function save() {
    setError(null);
    if (!method) return setError("Say whether it was cash or a bank transfer.");
    const result = recordPaymentOn(entry.id, { amount: typed, date, method, bankName, note });
    if (!result.ok) return setError(result.reason);
    setSaving(true);
    const confirmed = await result.saved;
    setSaving(false);
    if (!confirmed) {
      return setError("This could not be saved yet — check the internet connection. It will keep trying, so please don't enter it twice.");
    }
    onSaved(
      result.remaining > 0
        ? `${w.done} ${formatPeso(typed)}. ${formatPeso(result.remaining)} is still ${incoming ? "owed to you" : "owed by you"}.`
        : `${w.done} ${formatPeso(typed)}. This is now paid in full.`,
    );
    onClose();
  }

  const chip = (on: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition active:scale-95 ${
      on ? "border-cacao bg-cacao text-ivory" : "border-line/25 bg-card hover:border-cacao hover:text-cacao"
    }`;
  const half = Math.round((remaining / 2) * 100) / 100;
  const overpaid = valid && typed > remaining + 0.005;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cacao/10 text-cacao">
              {incoming ? <BanknoteArrowDown className="h-5 w-5" /> : <BanknoteArrowUp className="h-5 w-5" />}
            </span>
            Record a payment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Who and what, and where it stands */}
          <div className="space-y-2.5 rounded-xl bg-secondary/60 p-3.5">
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              {incoming ? <User className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Store className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="truncate">{who}</span>
              {entry.sku && (
                <span className="flex min-w-0 items-center gap-1 text-[13px] font-normal text-muted-foreground">
                  <Package className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{entry.sku}</span>
                </span>
              )}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-line/15" aria-hidden>
              <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[14px] font-semibold tabular-nums">
              <span className="flex items-center justify-center gap-1.5" title="Total">
                <Receipt className="h-4 w-4 text-muted-foreground" aria-label="Total" />
                {formatPeso(total)}
              </span>
              <span className="flex items-center justify-center gap-1.5 text-success" title={incoming ? "Received" : "Paid"}>
                <CircleCheck className="h-4 w-4" aria-label={incoming ? "Received" : "Paid"} />
                {formatPeso(paidBefore)}
              </span>
              <span className="flex items-center justify-center gap-1.5" title="Still owed">
                <Hourglass className="h-4 w-4 text-[var(--status-warning)]" aria-label="Still owed" />
                {formatPeso(remaining)}
              </span>
            </div>
          </div>

          {/* How much */}
          <div className="space-y-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] font-semibold text-muted-foreground">₱</span>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                aria-label="Amount"
                className="h-14 pl-9 pr-28 text-[22px] font-bold tabular-nums"
              />
              <span
                className={`pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[12.5px] font-semibold ${
                  overpaid ? "text-danger" : leftAfter === 0 && valid ? "text-success" : "text-muted-foreground"
                }`}
                aria-live="polite"
              >
                {overpaid ? (
                  <>
                    <TriangleAlert className="h-3.5 w-3.5" /> Too much
                  </>
                ) : valid && leftAfter === 0 ? (
                  <>
                    <CircleCheck className="h-3.5 w-3.5" /> Settled
                  </>
                ) : valid ? (
                  <>
                    <Hourglass className="h-3.5 w-3.5" /> {formatPeso(leftAfter)} left
                  </>
                ) : null}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAmount(String(remaining))} className={chip(valid && Math.abs(typed - remaining) < 0.005)}>
                <CircleCheck className="h-4 w-4" />
                All
              </button>
              {half > 0 && half < remaining && (
                <button type="button" onClick={() => setAmount(String(half))} className={chip(valid && Math.abs(typed - half) < 0.005)}>
                  <CircleDot className="h-4 w-4" />
                  Half
                </button>
              )}
            </div>
          </div>

          {/* When */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setDate(today)} className={chip(date === today)}>
              <CalendarCheck className="h-4 w-4" />
              Today
            </button>
            {yesterday >= earliest && (
              <button type="button" onClick={() => setDate(yesterday)} className={chip(date === yesterday)}>
                <CalendarDays className="h-4 w-4" />
                Yesterday
              </button>
            )}
            <Input type="date" value={date} max={today} min={earliest} onChange={(e) => setDate(e.target.value)} aria-label="Date of payment" className="h-9 w-auto min-w-[150px] flex-1" />
          </div>

          {/* How */}
          <MethodFields method={method} bankName={bankName} label="" onChange={(n) => (setMethod(n.method), setBankName(n.bankName))} />

          {/* A note, if wanted */}
          {showNote ? (
            <div className="relative">
              <StickyNote className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note — e.g. GCash ref 1234" className="h-10 pl-9" autoFocus />
            </div>
          ) : (
            <button type="button" onClick={() => setShowNote(true)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-cacao">
              <StickyNote className="h-4 w-4" />
              Add a note
            </button>
          )}

          {(error || problem) && <ErrorLine text={error ?? problem ?? ""} />}

          <div className="flex gap-2">
            <Button variant="ghost" className="h-12 gap-1.5 px-4" onClick={onClose}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button className="h-12 flex-1 gap-2 text-[15px]" disabled={saving || !valid || !!problem} onClick={() => void save()}>
              <Check className="h-4 w-4" strokeWidth={2.4} />
              {saving ? "Saving…" : valid ? `${formatPeso(typed)} ${incoming ? "received" : "paid"}` : "Record"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Confirms that an overdue obligation has defaulted. The balance stays; nothing is written off. */
export function DefaultDialog({
  entry,
  kind,
  onClose,
  onSaved,
}: {
  entry: Entry;
  kind: ObligationKind;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const info = obligationInfo(entry, new Date());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const who = entry.counterparty ?? (kind === "receivable" ? "This customer" : "This supplier");

  async function confirm() {
    const result = markDefaulted(entry.id);
    if (!result.ok) return setError(result.reason);
    setSaving(true);
    const ok = await result.saved;
    setSaving(false);
    if (!ok) return setError("This could not be saved yet — check the internet connection and try again.");
    onSaved(`Marked as defaulted. ${formatPeso(info.remaining)} stays on the list until it is paid.`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as defaulted?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-[14px]">
          <div className="space-y-1 rounded-xl bg-secondary/60 p-3">
            <p className="font-semibold">{who}</p>
            <p>
              Originally {formatPeso(entry.amount ?? 0)} · {kind === "receivable" ? "received" : "paid"} so far {formatPeso(info.paid)}
            </p>
            <p className="font-semibold text-danger">{formatPeso(info.remaining)} still unpaid</p>
            <p className="text-muted-foreground">
              Due {entry.dueDate} · {Math.abs(info.daysLeft ?? 0)} day{Math.abs(info.daysLeft ?? 0) === 1 ? "" : "s"} overdue
            </p>
          </div>
          <p className="text-muted-foreground">
            This only labels it as defaulted. The balance stays on the list, it is not counted as money {kind === "receivable" ? "received" : "paid"}, and
            it can still be paid later.
          </p>
          {error && <ErrorLine text={error} />}
          <div className="flex gap-2">
            <Button className="h-12 flex-1 text-[15px]" disabled={saving} onClick={() => void confirm()}>
              {saving ? "Saving…" : "Yes, mark as defaulted"}
            </Button>
            <Button variant="ghost" className="h-12 px-6" onClick={onClose}>
              Not yet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A new deadline. The earlier one is kept in the history rather than overwritten. */
export function DueDateDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: Entry;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [terms, setTerms] = useState<string>(entry.paymentTerms ?? "date");
  const [dueDate, setDueDate] = useState(entry.dueDate ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function pickTerms(next: string) {
    setTerms(next);
    const fromDay = todayOf(new Date());
    const implied = dueFromTerms(next, fromDay);
    if (implied) setDueDate(implied);
  }

  async function save() {
    const result = moveDueDate(entry.id, { dueDate, terms, reason });
    if (!result.ok) return setError(result.reason);
    setSaving(true);
    const ok = await result.saved;
    setSaving(false);
    if (!ok) return setError("This could not be saved yet — check the internet connection and try again.");
    onSaved(`Due date changed to ${dueDate}. The earlier date (${entry.dueDate ?? "none"}) is kept in the history.`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change the due date</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-[14px] text-muted-foreground">
            Now due: <span className="font-semibold text-foreground">{entry.dueDate ?? "no date set"}</span>
            {entry.paymentTerms ? ` · ${termsLabel(entry.paymentTerms)}` : ""}
          </p>
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">New arrangement</Label>
            <ChipGroup options={PAYMENT_TERMS.map(([k]) => k)} value={terms} labels={Object.fromEntries(PAYMENT_TERMS)} onChange={pickTerms} />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px] font-semibold">New due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Why? (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-10" />
          </div>
          {error && <ErrorLine text={error} />}
          <div className="flex gap-2">
            <Button className="h-12 flex-1 text-[15px]" disabled={saving || !dueDate} onClick={() => void save()}>
              {saving ? "Saving…" : "Save new date"}
            </Button>
            <Button variant="ghost" className="h-12 px-6" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
