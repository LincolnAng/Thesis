"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChipGroup } from "@/components/ui/chip-group";
import { COMMON_BANKS } from "@/components/transactions/method-fields";
import { formatPeso } from "@/lib/format";
import { markDefaulted, moveDueDate, recordPaymentOn } from "@/lib/transactions/actions";
import { PAYMENT_TERMS, dayOf, dueFromTerms, obligationInfo, termsLabel, todayOf, type ObligationKind } from "@/lib/transactions/ledger";
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
 * A payment against something already owed, as a single line under its row: the amount (starting
 * at the whole balance, the common case), cash or bank, and Save. The date is today. It never
 * creates a second receivable or payable: the amount is added to that one's history and the
 * balance drops by exactly that much.
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
  onSaved: (message: string) => void;
}) {
  const w = WORDS[kind];
  const incoming = kind === "receivable";
  const today = todayOf(new Date());
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState<"cash" | "bank_transfer">("cash");
  const [bank, setBank] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const typed = Number(amount.replace(/[^0-9.]/g, ""));
  const valid = Number.isFinite(typed) && typed > 0;
  const leftAfter = valid ? Math.max(0, Math.round((remaining - typed) * 100) / 100) : remaining;
  const problem = !valid
    ? null
    : typed > remaining + 0.005
      ? `More than the ${formatPeso(remaining)} still owed.`
      : today < dayOf(entry.timestamp)
        ? "This transaction is dated in the future."
        : method === "bank_transfer" && !bank.trim()
          ? "Which bank?"
          : null;

  async function save() {
    setError(null);
    const result = recordPaymentOn(entry.id, { amount: typed, date: today, method, bankName: method === "bank_transfer" ? bank.trim() : null, note: "" });
    if (!result.ok) return setError(result.reason);
    setSaving(true);
    const confirmed = await result.saved;
    setSaving(false);
    if (!confirmed) {
      return setError("Not saved yet — check the internet connection. It keeps trying, so please don't enter it twice.");
    }
    onSaved(
      result.remaining > 0
        ? `${w.done} ${formatPeso(typed)}. ${formatPeso(result.remaining)} is still ${incoming ? "owed to you" : "owed by you"}.`
        : `${w.done} ${formatPeso(typed)}. This is now paid in full.`,
    );
    onClose();
  }

  const seg = (on: boolean) =>
    `h-9 rounded-md px-3 text-[13px] font-semibold transition ${on ? "bg-cacao text-ivory" : "text-muted-foreground hover:bg-card"}`;

  return (
    <div className="space-y-1.5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-muted-foreground">{incoming ? "Received" : "Paid"}</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-muted-foreground">₱</span>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && valid && !problem && !saving && void save()}
            aria-label="Amount"
            autoFocus
            className="h-9 w-32 pl-6 text-[14px] font-semibold tabular-nums"
          />
        </div>
        <div className="flex gap-0.5 rounded-lg bg-secondary p-0.5" role="radiogroup" aria-label="How it was paid">
          <button type="button" role="radio" aria-checked={method === "cash"} onClick={() => setMethod("cash")} className={seg(method === "cash")}>
            Cash
          </button>
          <button type="button" role="radio" aria-checked={method === "bank_transfer"} onClick={() => setMethod("bank_transfer")} className={seg(method === "bank_transfer")}>
            Bank
          </button>
        </div>
        {method === "bank_transfer" && (
          <>
            <Input list="quickpay-banks" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Which bank?" aria-label="Bank" className="h-9 w-36 text-[13px]" />
            <datalist id="quickpay-banks">
              {COMMON_BANKS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </>
        )}
        <span className={`text-[12.5px] ${problem && problem !== "Which bank?" ? "font-semibold text-danger" : "text-muted-foreground"}`} aria-live="polite">
          {problem ?? (valid ? (leftAfter > 0 ? `${formatPeso(leftAfter)} left after` : "Settles it") : "")}
        </span>
        <Button size="sm" className="h-9 px-4" disabled={saving || !valid || !!problem} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <button type="button" onClick={onClose} aria-label="Cancel" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary">
          <X className="h-4 w-4" />
        </button>
      </div>
      {error && <ErrorLine text={error} />}
    </div>
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
