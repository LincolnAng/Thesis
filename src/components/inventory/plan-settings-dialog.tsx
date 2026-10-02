"use client";

import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SettingNumberInput } from "@/components/ui/setting-number-input";
import { MachinesPanel } from "@/components/scheduling/machines-panel";
import { setShelfLifeDays, shelfLifeDays } from "@/lib/summary/business-config";
import { updateProduct } from "@/lib/store/store";
import { formatDate, pluralize } from "@/lib/format";
import { useStore } from "@/lib/store/use-store";
import type { BusinessEvent } from "@/lib/store/types";

/** Minutes as hours and minutes, for the "and that's N a batch" aside. */
function minutesLabel(total: number): string {
  const mins = Math.round(total);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** What the schedule depends on but the owner rarely changes: equipment, how long a jar
 * takes, shelf life, and how much is planned for each upcoming event. */
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

          {/* Beside equipment on purpose: hours a day and minutes a jar are the two halves
              of the same sum, and the calendar can't place anything without both. */}
          <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">How long one jar takes</h2>
            <p className="text-xs text-muted-foreground">
              Cacao through to a sealed jar, for one jar. This is what fills the equipment&apos;s hours, and what
              labor costs are worked out from.
            </p>
            <ul className="divide-y divide-border">
              {products.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                  <SettingNumberInput
                    className="h-9 w-20"
                    value={p.minutesPerUnit ?? 0}
                    onCommit={(n) => updateProduct(p.id, { minutesPerUnit: Math.max(0, n) })}
                  />
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">
                    {p.minutesPerUnit ? `min · ${minutesLabel(p.minutesPerUnit * Math.max(0, p.batchYield))} a batch` : "min a jar"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Shelf life</h2>
            <p className="text-xs text-muted-foreground">Days a jar stays good. Used by the Min expiry schedule.</p>
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
