"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addEvent, updateEvent } from "@/lib/store/store";
import { setEventPlan } from "@/lib/summary/business-config";
import type { BusinessEvent, Product } from "@/lib/store/types";

/**
 * Plans stock for an event: when it is, and how many jars of each product to bring. The
 * jars are added to the production target, due the day before the event. The event itself
 * shows up on the Events page, where stock is borrowed and returned as usual.
 */
export function EventPlanDialog({
  products,
  event,
  plan,
  defaultDate,
  onClose,
}: {
  products: Product[];
  /** Editing an existing event's plan; omit to create a new event. */
  event?: BusinessEvent;
  plan?: Record<string, number>;
  defaultDate?: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(event?.name ?? "");
  const [date, setDate] = useState(event?.startDate?.slice(0, 10) ?? defaultDate ?? "");
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, plan?.[p.id] ? String(plan[p.id]) : ""])),
  );
  const totalJars = Object.values(qty).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const valid = name.trim() !== "" && date !== "" && totalJars > 0;

  function save() {
    if (!valid) return;
    const nextPlan = Object.fromEntries(
      Object.entries(qty)
        .map(([id, v]) => [id, Math.max(0, Math.round(Number(v) || 0))] as const)
        .filter(([, n]) => n > 0),
    );
    if (event) {
      updateEvent(event.id, { name: name.trim(), startDate: date, endDate: event.endDate ?? date });
      setEventPlan(event.id, nextPlan);
    } else {
      const created = addEvent({ name: name.trim(), kind: "event", startDate: date, endDate: date, status: "open", notes: "" });
      setEventPlan(created.id, nextPlan);
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{event ? `Plan for ${event.name}` : "Add event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Event</Label>
              <Input autoFocus={!event} placeholder="e.g. Ayala Mall bazaar" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">How many jars will you bring?</Label>
            <ul className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
              {products.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{p.name}</span>
                  <Input
                    type="number"
                    placeholder="0"
                    className="h-9 w-24"
                    value={qty[p.id] ?? ""}
                    onChange={(e) => setQty((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {totalJars > 0
                ? `${totalJars} jars added to the production target, ready the day before the event.`
                : "These jars are added to what needs making, due the day before the event."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={save}>
            {event ? "Save plan" : "Add event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
