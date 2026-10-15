"use client";

import { currentUser } from "@/lib/auth/current-user";
import { getSnapshot, replaceEntryTracked } from "@/lib/store/store";
import { addPayment, changeDueDate, confirmDefault, editPayment, outstanding, removePayment, type PaymentInput } from "@/lib/transactions/ledger";
import type { Entry } from "@/lib/store/types";

/**
 * What a person can do to a receivable or payable that already exists: record a payment (and
 * correct or take one back), confirm a default, move the deadline. Each one works out the change in lib/transactions/
 * ledger.ts (which refuses anything that would corrupt a balance), then saves it by editing
 * the same entry — so there is one record per obligation, never a second one.
 *
 * `saved` settles true only once the server has confirmed the write. Anything that tells the
 * owner "saved" waits for it.
 */

export type ActionResult =
  | { ok: true; saved: Promise<boolean>; entry: Entry; remaining: number }
  | { ok: false; reason: string };

function find(entryId: string): Entry | undefined {
  return getSnapshot().entries.find((e) => e.id === entryId);
}

function apply(entry: Entry, patch: Partial<Entry>): ActionResult {
  const { id, ...rest } = { ...entry, ...patch };
  void id;
  const saved = replaceEntryTracked(entry.id, rest);
  const next = { ...entry, ...patch };
  return { ok: true, saved, entry: next, remaining: outstanding(next) };
}

export function recordPaymentOn(entryId: string, input: PaymentInput): ActionResult {
  const entry = find(entryId);
  if (!entry) return { ok: false, reason: "That transaction can't be found any more." };
  const who = currentUser();
  const change = addPayment(entry, input, { id: who?.id, name: who?.name }, new Date());
  return change.ok ? apply(entry, change.patch) : change;
}

/** Takes back a payment recorded by mistake. */
export function removePaymentOn(entryId: string, paymentId: string): ActionResult {
  const entry = find(entryId);
  if (!entry) return { ok: false, reason: "That transaction can't be found any more." };
  const change = removePayment(entry, paymentId, new Date());
  return change.ok ? apply(entry, change.patch) : change;
}

/** Corrects a payment: its amount, day or how it was paid. */
export function editPaymentOn(entryId: string, paymentId: string, input: PaymentInput): ActionResult {
  const entry = find(entryId);
  if (!entry) return { ok: false, reason: "That transaction can't be found any more." };
  const who = currentUser();
  const change = editPayment(entry, paymentId, input, { id: who?.id, name: who?.name }, new Date());
  return change.ok ? apply(entry, change.patch) : change;
}

export function markDefaulted(entryId: string): ActionResult {
  const entry = find(entryId);
  if (!entry) return { ok: false, reason: "That transaction can't be found any more." };
  const change = confirmDefault(entry, new Date());
  return change.ok ? apply(entry, change.patch) : change;
}

export function moveDueDate(entryId: string, next: { dueDate: string; terms?: string | null; reason?: string | null }): ActionResult {
  const entry = find(entryId);
  if (!entry) return { ok: false, reason: "That transaction can't be found any more." };
  const who = currentUser();
  const change = changeDueDate(entry, next, { name: who?.name }, new Date());
  return change.ok ? apply(entry, change.patch) : change;
}
