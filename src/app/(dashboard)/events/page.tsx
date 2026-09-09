"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Pencil, Plus } from "lucide-react";
import { StatTile } from "@/components/data-table/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { BigRowList } from "@/components/data-table/big-row-list";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { EventDialog } from "@/components/events/event-dialog";
import { useStore } from "@/lib/store/use-store";
import { addEvent, deleteEvent, updateEvent } from "@/lib/store/store";
import { formatDate, formatPeso } from "@/lib/format";
import { eventStats, isEventActive } from "@/lib/summary/event-summary";
import { useViewMode } from "@/lib/summary/view-mode";
import type { Event } from "@/lib/store/types";

export default function EventsPage() {
  const { events, entries } = useStore();
  const [viewMode] = useViewMode();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);

  const rows = useMemo(
    () =>
      events
        .map((event) => ({ event, stats: eventStats(event, entries), active: isEventActive(event) }))
        .sort((a, b) => new Date(b.event.startDate).getTime() - new Date(a.event.startDate).getTime()),
    [events, entries],
  );

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    {
      key: "name",
      header: "Event",
      render: ({ event, active }) => (
        <div>
          <p className="font-medium text-foreground">
            {event.name}
            {active && <span className="ml-2 rounded-full bg-[var(--status-good)]/15 px-2 py-0.5 text-xs text-[var(--status-good)]">Active</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(event.startDate)} – {formatDate(event.endDate)}
          </p>
        </div>
      ),
    },
    { key: "entries", header: "Entries", align: "right", render: ({ stats }) => String(stats.entryCount) },
    { key: "revenue", header: "Revenue", align: "right", render: ({ stats }) => formatPeso(stats.revenue) },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-foreground">Events</h1>
        <p className="text-sm text-muted-foreground">{events.length} tracked</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Time-boxed sales periods — a mall fiesta, a holiday promo, a trade show — tracked separately from normal
        day-to-day sales. Shows every entry logged during the date range, plus anything explicitly tagged to it.
      </p>

      {viewMode === "advanced" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Events" value={String(events.length)} />
            <StatTile label="Active now" value={String(rows.filter((r) => r.active).length)} tone="good" />
          </div>

          <div className="flex justify-end">
            <Button size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> New event
            </Button>
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            keyFor={({ event }) => event.id}
            emptyMessage="No events yet."
            renderRowActions={({ event }) => (
              <div className="flex items-center justify-end gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Edit event" onClick={() => setEditing(event)}>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
                <ConfirmDeleteButton onConfirm={() => deleteEvent(event.id)} />
              </div>
            )}
          />
        </>
      ) : (
        <>
          <Button size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> New event
          </Button>

          <BigRowList
            rows={rows}
            keyFor={({ event }) => event.id}
            icon={CalendarDays}
            iconTone="good"
            title={({ event }) => event.name}
            subtitle={({ event }) => `${formatDate(event.startDate)} – ${formatDate(event.endDate)}`}
            trailing={({ stats }) => formatPeso(stats.revenue)}
            trailingTone="good"
            onSelect={({ event }) => setEditing(event)}
            onDelete={({ event }) => deleteEvent(event.id)}
            emptyMessage="No events yet."
          />
        </>
      )}

      {addOpen && <EventDialog event={null} onClose={() => setAddOpen(false)} onSave={(patch) => addEvent(patch)} />}

      {editing && (
        <EventDialog
          key={editing.id}
          event={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => updateEvent(editing.id, patch)}
          onDelete={() => deleteEvent(editing.id)}
        />
      )}
    </div>
  );
}
