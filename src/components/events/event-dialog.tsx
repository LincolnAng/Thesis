"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { formatPeso } from "@/lib/format";
import { eventStats, entriesForEvent } from "@/lib/summary/event-summary";
import { useStore } from "@/lib/store/use-store";
import type { Event } from "@/lib/store/types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EventDialog({
  event,
  onClose,
  onSave,
  onDelete,
}: {
  /** null = "create new" mode; otherwise editing this existing event. */
  event: Event | null;
  onClose: () => void;
  onSave: (patch: Omit<Event, "id">) => void;
  onDelete?: () => void;
}) {
  const { entries } = useStore();
  const [name, setName] = useState(event?.name ?? "");
  const [startDate, setStartDate] = useState(event?.startDate.slice(0, 10) ?? todayIso());
  const [endDate, setEndDate] = useState(event?.endDate.slice(0, 10) ?? todayIso());
  const [notes, setNotes] = useState(event?.notes ?? "");

  const stats = event ? eventStats(event, entries) : null;
  const recent = event ? entriesForEvent(event, entries).slice(0, 8) : [];

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || !startDate || !endDate) return;
    onSave({ name: trimmed, startDate, endDate, notes: notes.trim() });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{event ? event.name : "New event"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mall fiesta week" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Starts</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Ends</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering…" rows={2} />
          </div>

          {event && stats && (
            <div className="rounded-xl border border-border p-3 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Entries during this period</span>
                <span className="font-semibold text-foreground">{stats.entryCount}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Sales revenue</span>
                <span className="font-semibold text-[var(--status-good)]">{formatPeso(stats.revenue)}</span>
              </div>
            </div>
          )}

          {event && recent.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Recent activity</p>
              <div className="divide-y divide-border rounded-xl border border-border">
                {recent.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="truncate text-foreground">{e.sku ?? e.rawText}</span>
                    <span className="shrink-0 text-muted-foreground">{formatPeso(e.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" className="flex-1" onClick={handleSave} disabled={!name.trim()}>
              {event ? "Save" : "Create event"}
            </Button>
            {event && onDelete && (
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
