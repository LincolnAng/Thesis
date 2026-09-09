"use client";

import { useMemo, useState } from "react";
import { Store } from "lucide-react";
import { StatTile } from "@/components/data-table/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { BigRowList } from "@/components/data-table/big-row-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChipGroup } from "@/components/ui/chip-group";
import { EventDetailDialog } from "@/components/events/event-detail-dialog";
import { useStore } from "@/lib/store/use-store";
import { addEvent } from "@/lib/store/store";
import { formatNumber, formatPeso } from "@/lib/format";
import { summarizeEvents } from "@/lib/summary/events";
import { useViewMode } from "@/lib/summary/view-mode";
import type { BusinessEvent } from "@/lib/store/types";

const KIND_LABELS: Record<BusinessEvent["kind"], string> = {
  event: "One-time event",
  distributor: "Shop / distributor",
};

export default function EventsPage() {
  const { events, eventStock, entries, products } = useStore();
  const [viewMode] = useViewMode();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BusinessEvent["kind"]>("event");

  const summaries = useMemo(
    () => summarizeEvents(events, eventStock, entries, products),
    [events, eventStock, entries, products],
  );
  // Derived live rather than captured, so the dialog keeps updating as stock moves in and out.
  const selected = summaries.find((s) => s.event.id === selectedId) ?? null;

  const outWithChannels = summaries.reduce((sum, s) => sum + s.totalOnHand, 0);
  const channelRevenue = summaries.reduce((sum, s) => sum + s.revenue, 0);
  const openCount = summaries.filter((s) => s.event.status === "open").length;

  function submitNew() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const created = addEvent({ name: trimmed, kind, startDate: null, endDate: null, status: "open", notes: "" });
    setName("");
    setAdding(false);
    setSelectedId(created.id);
  }

  const columns: DataTableColumn<(typeof summaries)[number]>[] = [
    {
      key: "name",
      header: "Place",
      render: (s) => (
        <div>
          <p className="font-medium text-foreground">{s.event.name}</p>
          <p className="text-xs text-muted-foreground">
            {KIND_LABELS[s.event.kind]}
            {s.event.status === "closed" && " · finished"}
          </p>
        </div>
      ),
    },
    { key: "onHand", header: "Still there", align: "right", render: (s) => formatNumber(s.totalOnHand) },
    { key: "sold", header: "Sold", align: "right", render: (s) => formatNumber(s.totalSold) },
    { key: "revenue", header: "Sales", align: "right", render: (s) => formatPeso(s.revenue) },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-foreground">Events &amp; shops</h1>
        <p className="text-sm text-muted-foreground">{openCount} running</p>
      </div>
      <p className="text-sm text-muted-foreground">
        For stock you send somewhere else — a weekend booth, or a shop like Nomad or Bandera. Send jars here and
        they leave your main stock; sales logged against the place come out of what it&apos;s holding, and anything
        unsold can be brought back.
      </p>

      {adding ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input
              autoFocus
              placeholder="Ayala Mall bazaar, Nomad, IFEX…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNew()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">What is it?</Label>
            <ChipGroup
              options={["event", "distributor"] as BusinessEvent["kind"][]}
              value={kind}
              labels={KIND_LABELS}
              onChange={setKind}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={!name.trim()} onClick={submitNew}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" onClick={() => setAdding(true)}>
          Add a place
        </Button>
      )}

      {viewMode === "advanced" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Places" value={String(summaries.length)} />
            <StatTile label="Stock out there" value={formatNumber(outWithChannels)} tone={outWithChannels > 0 ? "warning" : "neutral"} />
            <StatTile label="Sales from them" value={formatPeso(channelRevenue)} tone="good" />
          </div>

          <DataTable
            columns={columns}
            rows={summaries}
            keyFor={(s) => s.event.id}
            emptyMessage="No events or shops yet. Add one when you send stock somewhere else to sell."
            renderRowActions={(s) => (
              <Button size="sm" variant="secondary" onClick={() => setSelectedId(s.event.id)}>
                Manage
              </Button>
            )}
          />
        </>
      ) : (
        <BigRowList
          rows={summaries}
          keyFor={(s) => s.event.id}
          icon={Store}
          iconTone="good"
          title={(s) => s.event.name}
          subtitle={(s) =>
            s.totalOnHand > 0
              ? `${formatNumber(s.totalOnHand)} still there · ${formatNumber(s.totalSold)} sold`
              : `${formatNumber(s.totalSold)} sold · nothing left there`
          }
          trailing={(s) => formatPeso(s.revenue)}
          trailingTone="good"
          onSelect={(s) => setSelectedId(s.event.id)}
          emptyMessage="No events or shops yet. Add one when you send stock somewhere else to sell."
        />
      )}

      {selected && <EventDetailDialog summary={selected} products={products} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
