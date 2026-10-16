"use client";

import { Minus, Pencil, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SettingNumberInput } from "@/components/ui/setting-number-input";
import { MachinesPanel } from "@/components/scheduling/machines-panel";
import { expiringWithinDays, setExpiringWithinDays, setShelfLifeDays, shelfLifeDays } from "@/lib/summary/business-config";
import { formatDate, pluralize } from "@/lib/format";
import { useStore } from "@/lib/store/use-store";
import { updateProduct } from "@/lib/store/store";
import { withBatchSize } from "@/lib/costing/per-unit";
import type { BusinessEvent } from "@/lib/store/types";

/** What the schedule depends on but the owner rarely changes: equipment, each product's usual
 * batch size, shelf life, and how much is planned for each upcoming event.
 *
 * Batch sizes live here rather than in Costing: costing is per unit and doesn't need them, and
 * they only exist so the schedule can count batches. Changing one rescales that product's stored
 * recipe so its cost per unit stays put (lib/costing/per-unit). */
export function PlanSettingsDialog({
  upcomingEvents,
  eventPlans,
  onEditEvent,
  onClose,
}: {
  upcomingEvents: BusinessEvent[];
  eventPlans: Record<string, Record<string, number>>;
  onEditEvent: (eventId: string) => void;
  onClose: () => void;
}) {
  const { machines, products, businessSettings } = useStore();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl border border-border ring-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <MachinesPanel machines={machines} />

          <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Batch sizes</h2>
            <p className="text-xs text-muted-foreground">How many you usually make at once. Only used to plan production — it doesn&apos;t change any cost.</p>
            <ul className="divide-y divide-border">
              {products.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                  <SettingNumberInput
                    className="h-9 w-20"
                    value={p.batchYield}
                    onCommit={(n) => n > 0 && n !== p.batchYield && updateProduct(p.id, withBatchSize(p, n))}
                  />
                  <span className="w-12 text-xs text-muted-foreground">{p.unit || "jars"}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Shelf life</h2>
            <p className="text-xs text-muted-foreground">Days a jar stays good. Used by the Latest Start schedule and to warn you before jars expire.</p>
            <ul className="divide-y divide-border">
              {products.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                  <SettingNumberInput
                    className="h-9 w-20"
                    value={shelfLifeDays(businessSettings, p.id)}
                    onCommit={(n) => n > 0 && setShelfLifeDays(p.id, n)}
                  />
                  <span className="text-xs text-muted-foreground">days</span>
                </li>
              ))}
            </ul>
            <ExpiryWarning />
          </section>

          {upcomingEvents.length > 0 && (
            <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground">Upcoming events</h2>
              <ul className="divide-y divide-border">
                {upcomingEvents.map((e) => {
                  const jars = Object.values(eventPlans[e.id] ?? {}).reduce((s, n) => s + n, 0);
                  return (
                    <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">{e.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {e.startDate ? formatDate(e.startDate) : "No date"} ·{" "}
                          {jars > 0 ? `bringing ${pluralize(jars, "jar")}` : "nothing planned yet"}
                        </span>
                      </span>
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => onEditEvent(e.id)}>
                        <Pencil className="h-3.5 w-3.5" /> Plan
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * When a jar starts counting as "expiring" — next to shelf life, which it counts down from.
 *
 * A counter rather than a dropdown of presets, because the right number depends on how she
 * sells: a week of notice is useless to someone who clears a batch in three days, and far too
 * little for someone who consigns to a shop. Zero means the day itself and nothing earlier.
 */
function ExpiryWarning() {
  const { businessSettings } = useStore();
  const days = expiringWithinDays(businessSettings);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <span className="min-w-0">
        <span className="block text-sm text-foreground">Warn me before jars expire</span>
        <span className="block text-xs text-muted-foreground">
          {days === 0 ? "Only on the day they expire." : `${days} ${days === 1 ? "day" : "days"} of notice, on Production, Costing and the calendar.`}
        </span>
      </span>
      <div className="flex items-center gap-1 rounded-full border border-line/15 bg-card">
        <button
          type="button"
          aria-label="Fewer days"
          disabled={days <= 0}
          onClick={() => setExpiringWithinDays(days - 1)}
          className="flex h-9 w-9 items-center justify-center rounded-l-full text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[72px] px-1 text-center text-[13px] font-semibold">{days === 0 ? "Same day" : `${days} ${days === 1 ? "day" : "days"}`}</span>
        <button
          type="button"
          aria-label="More days"
          onClick={() => setExpiringWithinDays(days + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-r-full text-muted-foreground transition-colors hover:bg-secondary"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
