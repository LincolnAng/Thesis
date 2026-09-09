"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { formatDate, formatPeso } from "@/lib/format";
import { entriesForCustomer, customerStats } from "@/lib/summary/customer-summary";
import { useStore } from "@/lib/store/use-store";
import type { Customer } from "@/lib/store/types";

export function CustomerDialog({
  customer,
  onClose,
  onSave,
  onDelete,
}: {
  /** null = "add new customer" mode; otherwise editing this existing customer. */
  customer: Customer | null;
  onClose: () => void;
  onSave: (patch: Omit<Customer, "id">) => void;
  onDelete?: () => void;
}) {
  const { entries } = useStore();
  // Initial-only — the call site remounts this component (via `key`) whenever a different
  // customer is opened, so there's no need to resync these on prop changes after mount.
  const [name, setName] = useState(customer?.name ?? "");
  const [contact, setContact] = useState(customer?.contact ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");

  const stats = customer ? customerStats(customer, entries) : null;
  const orders = customer ? entriesForCustomer(customer, entries).slice(0, 10) : [];

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({ name: trimmed, contact: contact.trim(), notes: notes.trim() });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{customer ? customer.name : "Add customer"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aling Nena" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Contact</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone, Facebook, etc." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Preferences, payment terms, anything worth remembering…"
              rows={3}
            />
          </div>

          {customer && stats && (
            <div className="rounded-xl border border-border p-3 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Orders</span>
                <span className="font-semibold text-foreground">{stats.orderCount}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Total spent</span>
                <span className="font-semibold text-foreground">{formatPeso(stats.totalSpent)}</span>
              </div>
              {stats.lastOrderAt && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Last order</span>
                  <span className="font-semibold text-foreground">{formatDate(stats.lastOrderAt)}</span>
                </div>
              )}
            </div>
          )}

          {customer && orders.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Recent orders</p>
              <div className="divide-y divide-border rounded-xl border border-border">
                {orders.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-foreground">{e.sku ?? "Sale"}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(e.timestamp)}</p>
                    </div>
                    <span className="shrink-0 font-medium text-[var(--status-good)]">{formatPeso(e.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" className="flex-1" onClick={handleSave} disabled={!name.trim()}>
              {customer ? "Save" : "Add customer"}
            </Button>
            {customer && onDelete && (
              <ConfirmDeleteButton
                onConfirm={() => {
                  onDelete();
                  onClose();
                }}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
