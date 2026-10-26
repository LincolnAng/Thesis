"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChipGroup } from "@/components/ui/chip-group";
import { COMMON_BANKS } from "@/components/transactions/method-fields";
import { COMMON_EWALLETS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, describePaymentMethod, formatPeso, namesProvider } from "@/lib/format";
import { editPaymentOn, markDefaulted, moveDueDate, recordPaymentOn, removePaymentOn } from "@/lib/transactions/actions";
import { PAYMENT_TERMS, dayOf, dueFromTerms, obligationInfo, termsLabel, todayOf, type ObligationKind } from "@/lib/transactions/ledger";
import type { Entry, PaymentMethod, PaymentRecord } from "@/lib/store/types";

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

/** The columns every payment line uses — the history, a correction and a new payment alike — so
 *  they all line up: day · how · amount · its two buttons. */
export const PAYMENT_GRID = "grid grid-cols-[136px_minmax(0,1fr)_108px_72px] items-center gap-x-3";

interface PaymentValues {
  date: string;
  amount: number;
  method: PaymentMethod;
  bankName: string | null;
  note: string;
}

/**
 * One payment being written — a new one, or a correction — laid out exactly like a line of the
 * history it belongs to: the day, cash or bank (and which bank), the amount, then save and
 * cancel where the pencil and bin sit; the note under it, where a saved note shows.
 */
function PaymentForm({
  initial,
  minDate,
  check,
  hint,
  onSave,
  onCancel,
}: {
  initial: { date: string; amount: string; method: PaymentMethod; bank: string; note: string };
  minDate: string;
  /** Anything wrong with the amount before it's even tried (more than is owed). */
  check?: (amount: number) => string | null;
  /** A quiet line about what this payment leaves. */
  hint?: (amount: number) => string;
  /** Saves; resolves to an error to show, or null when it went through. */
  onSave: (v: PaymentValues) => Promise<string | null>;
  onCancel: () => void;
}) {
  const today = todayOf(new Date());
  const [date, setDate] = useState(initial.date);
  const [amount, setAmount] = useState(initial.amount);
  const [method, setMethod] = useState(initial.method);
  const [bank, setBank] = useState(initial.bank);
  const [note, setNote] = useState(initial.note);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const typed = Number(amount.replace(/[^0-9.]/g, ""));
  const valid = Number.isFinite(typed) && typed > 0;
  const problem = !valid
    ? null
    : (check?.(typed) ??
      (!date
        ? "Pick the day it was paid."
        : date > today
          ? "That day hasn't happened yet."
          : date < minDate
            ? "That's before the transaction itself."
            : null));
  const ready = valid && !problem && !(method === "bank_transfer" && !bank.trim());

  async function save() {
    if (!ready || saving) return;
    setError(null);
    setSaving(true);
    const err = await onSave({ date, amount: typed, method, bankName: namesProvider(method) ? bank.trim() || null : null, note: note.trim() });
    setSaving(false);
    if (err) setError(err);
  }
  const enter = (e: React.KeyboardEvent) => e.key === "Enter" && void save();
  const line = problem ?? (valid && hint ? hint(typed) : "");

  return (
    <li className="-mx-2 flex flex-col gap-1.5 rounded-lg bg-secondary/60 px-2 py-2" onClick={(e) => e.stopPropagation()}>
      <div className={PAYMENT_GRID}>
        <Input type="date" value={date} max={today} min={minDate} onChange={(e) => setDate(e.target.value)} aria-label="Day it was paid" className="h-8 w-full px-2 text-[12.5px]" />
        <div className="flex min-w-0 items-center gap-1.5">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            aria-label="How it was paid"
            className="h-8 shrink-0 rounded-md border border-input bg-card px-1.5 text-[12.5px] font-semibold"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
          {namesProvider(method) && (
            <>
              <Input
                list={method === "ewallet" ? "payment-ewallets" : "payment-banks"}
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                onKeyDown={enter}
                placeholder={method === "ewallet" ? "Which e-wallet?" : "Which bank?"}
                aria-label={method === "ewallet" ? "E-wallet" : "Bank"}
                className="h-8 min-w-0 flex-1 text-[12.5px]"
              />
              <datalist id="payment-banks">
                {COMMON_BANKS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <datalist id="payment-ewallets">
                {COMMON_EWALLETS.map((w) => (
                  <option key={w} value={w} />
                ))}
              </datalist>
            </>
          )}
        </div>
        <span className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12.5px] text-muted-foreground">₱</span>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            onKeyDown={enter}
            aria-label="Amount"
            autoFocus
            className="h-8 w-full pl-5 text-right text-[13px] font-semibold tabular-nums"
          />
        </span>
        <span className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!ready || saving}
            aria-label="Save payment"
            title="Save"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-cacao text-ivory transition disabled:opacity-40"
          >
            <Check className="h-4 w-4" strokeWidth={3} />
          </button>
          <button type="button" onClick={onCancel} aria-label="Cancel" title="Cancel" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-card">
            <X className="h-4 w-4" />
          </button>
        </span>
      </div>
      <div className={PAYMENT_GRID}>
        <span className={`text-[11.5px] ${problem ? "font-semibold text-danger" : "text-muted-foreground"}`} aria-live="polite">
          {saving ? "Saving…" : line}
        </span>
        <Input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={enter} placeholder="Note (optional)" aria-label="Note" className="col-span-2 h-8 text-[12.5px]" />
        <span />
      </div>
      {error && <ErrorLine text={error} />}
    </li>
  );
}

/**
 * A new payment against something already owed, as a new line at the end of its payment
 * history: the day (today unless changed), cash or bank, the amount (the whole balance to start
 * with, the common case) and a note. It never creates a second receivable or payable: the amount
 * is added to that one's history and the balance drops by exactly that much.
 */
export function QuickPay({
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
  /** The message to show, and a way to take the payment back if it was a mistake. */
  onSaved: (message: string, undo?: () => Promise<string>) => void;
}) {
  const w = WORDS[kind];
  const incoming = kind === "receivable";
  return (
    <PaymentForm
      initial={{ date: todayOf(new Date()), amount: String(remaining), method: "cash", bank: "", note: "" }}
      minDate={dayOf(entry.timestamp)}
      check={(n) => (n > remaining + 0.005 ? `More than the ${formatPeso(remaining)} owed.` : null)}
      hint={(n) => {
        const left = Math.max(0, Math.round((remaining - n) * 100) / 100);
        return left > 0 ? `${formatPeso(left)} left after` : "";
      }}
      onCancel={onClose}
      onSave={async (v) => {
        const result = recordPaymentOn(entry.id, { amount: v.amount, date: v.date, method: v.method, bankName: v.bankName, note: v.note });
        if (!result.ok) return result.reason;
        if (!(await result.saved)) return "Not saved yet — check the internet connection. It keeps trying, so please don't enter it twice.";
        const newId = result.entry.payments?.at(-1)?.id;
        onSaved(
          result.remaining > 0
            ? `${w.done} ${formatPeso(v.amount)}. ${formatPeso(result.remaining)} is still ${incoming ? "owed to you" : "owed by you"}.`
            : `${w.done} ${formatPeso(v.amount)}. This is now paid in full.`,
          newId
            ? async () => {
                const back = removePaymentOn(entry.id, newId);
                if (!back.ok) return back.reason;
                return (await back.saved) ? `Took back the ${formatPeso(v.amount)} payment.` : "Not saved yet — check the internet connection.";
              }
            : undefined,
        );
        onClose();
        return null;
      }}
    />
  );
}

/**
 * One payment in an obligation's history. A mistake — a typo in the amount, the wrong day, cash
 * that was really a transfer — is fixed here: correct it in place (the same line, now editable),
 * or remove it. Either way the balance follows, and the ledger checks a correction exactly as it
 * checks a new payment.
 */
export function PaymentLine({
  entry,
  payment,
  canChange,
  onChanged,
}: {
  entry: Entry;
  payment: PaymentRecord;
  /** Executives, on an obligation they can act on. */
  canChange: boolean;
  onChanged: (message: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "remove">("view");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const how = describePaymentMethod(payment.method, payment.bankName) || "Not recorded";
  const day = new Date(`${payment.date}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  const iconBtn = "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-cacao";

  if (mode === "edit") {
    return (
      <PaymentForm
        initial={{
          date: payment.date,
          amount: String(payment.amount),
          method: (PAYMENT_METHODS as readonly string[]).includes(payment.method ?? "") ? (payment.method as PaymentMethod) : "cash",
          bank: payment.bankName ?? "",
          note: payment.note ?? "",
        }}
        minDate={dayOf(entry.timestamp)}
        onCancel={() => setMode("view")}
        onSave={async (v) => {
          const result = editPaymentOn(entry.id, payment.id, { amount: v.amount, date: v.date, method: v.method, bankName: v.bankName, note: v.note });
          if (!result.ok) return result.reason;
          if (!(await result.saved)) return "Not saved yet — check the internet connection and try again.";
          setMode("view");
          onChanged(`Corrected the payment to ${formatPeso(v.amount)}.`);
          return null;
        }}
      />
    );
  }

  async function remove() {
    const result = removePaymentOn(entry.id, payment.id);
    if (!result.ok) return setError(result.reason);
    setSaving(true);
    const ok = await result.saved;
    setSaving(false);
    if (!ok) return setError("Not saved yet — check the internet connection and try again.");
    setMode("view");
    onChanged(`Removed the ${formatPeso(payment.amount)} payment.`);
  }

  return (
    <li className="flex flex-col gap-0.5 py-1" onClick={(e) => mode !== "view" && e.stopPropagation()}>
      <div className={PAYMENT_GRID}>
        <span className="text-muted-foreground tabular-nums">{day}</span>
        <span className="truncate">{how}</span>
        <span className="text-right font-semibold tabular-nums">{formatPeso(payment.amount)}</span>
        <span className="flex items-center justify-end gap-0.5">
          {canChange && mode === "view" && (
            <>
              <button type="button" onClick={(e) => (e.stopPropagation(), setMode("edit"))} aria-label="Correct this payment" title="Correct this payment" className={iconBtn}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={(e) => (e.stopPropagation(), setMode("remove"))} aria-label="Remove this payment" title="Remove this payment" className={`${iconBtn} hover:text-danger`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </span>
      </div>
      {payment.note && (
        <div className={PAYMENT_GRID}>
          <span />
          <p className="col-span-2 text-[12.5px] italic text-muted-foreground">“{payment.note}”</p>
        </div>
      )}
      {mode === "remove" && (
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg bg-danger/5 px-2 py-1.5">
          <span className="text-[12.5px]">Remove this {formatPeso(payment.amount)} payment? The balance goes back up by that much.</span>
          <button type="button" onClick={() => setMode("view")} className="min-h-8 rounded-lg px-2.5 text-[12.5px] font-semibold text-muted-foreground hover:bg-secondary">
            Keep it
          </button>
          <button type="button" disabled={saving} onClick={() => void remove()} className="min-h-8 rounded-lg bg-danger px-3 text-[12.5px] font-semibold text-white disabled:opacity-50">
            {saving ? "Removing…" : "Remove"}
          </button>
        </div>
      )}
      {mode === "remove" && error && <ErrorLine text={error} />}
    </li>
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
