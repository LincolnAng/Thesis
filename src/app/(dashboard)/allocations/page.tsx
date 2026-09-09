"use client";

import { useMemo, useState } from "react";
import { Package, Pencil, Plus } from "lucide-react";
import { StatTile } from "@/components/data-table/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { BigRowList } from "@/components/data-table/big-row-list";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { AllocationDialog } from "@/components/allocations/allocation-dialog";
import { useStore } from "@/lib/store/use-store";
import { addAllocation, deleteAllocation, updateAllocation } from "@/lib/store/store";
import { formatNumber } from "@/lib/format";
import { allocationStats } from "@/lib/summary/allocations";
import { useViewMode } from "@/lib/summary/view-mode";
import type { Allocation } from "@/lib/store/types";

export default function AllocationsPage() {
  const { allocations, products, entries } = useStore();
  const [viewMode] = useViewMode();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Allocation | null>(null);

  const rows = useMemo(
    () =>
      allocations.map((allocation) => ({
        allocation,
        product: products.find((p) => p.id === allocation.productId),
        stats: allocationStats(allocation, entries),
      })),
    [allocations, products, entries],
  );

  const totalReserved = rows.reduce((sum, r) => sum + r.allocation.allocatedQty, 0);
  const totalRemaining = rows.reduce((sum, r) => sum + r.stats.remaining, 0);

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    {
      key: "for",
      header: "For",
      render: ({ allocation, product }) => (
        <div>
          <p className="font-medium text-foreground">{allocation.label}</p>
          <p className="text-xs text-muted-foreground">{product?.name ?? "Unknown product"}</p>
        </div>
      ),
    },
    { key: "reserved", header: "Reserved", align: "right", render: ({ allocation }) => formatNumber(allocation.allocatedQty) },
    { key: "used", header: "Used", align: "right", render: ({ stats }) => formatNumber(stats.used) },
    {
      key: "remaining",
      header: "Remaining",
      align: "right",
      render: ({ stats }) => (
        <span className={stats.remaining <= 0 ? "font-medium text-[var(--status-warning)]" : "font-medium text-[var(--status-good)]"}>
          {formatNumber(stats.remaining)}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-foreground">Allocations</h1>
        <p className="text-sm text-muted-foreground">{allocations.length} active</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Reserve stock on paper for a distributor or event (e.g. 30 jars for Nomad) and see how much is left, without
        touching your main stock count. Tag a sale against one when logging it in the entry form.
      </p>

      {viewMode === "advanced" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Allocations" value={String(allocations.length)} />
            <StatTile label="Total reserved" value={formatNumber(totalReserved)} />
            <StatTile label="Total remaining" value={formatNumber(totalRemaining)} tone="good" />
          </div>

          <div className="flex justify-end">
            <Button size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> New allocation
            </Button>
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            keyFor={({ allocation }) => allocation.id}
            emptyMessage="No allocations yet."
            renderRowActions={({ allocation }) => (
              <div className="flex items-center justify-end gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Edit allocation" onClick={() => setEditing(allocation)}>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
                <ConfirmDeleteButton onConfirm={() => deleteAllocation(allocation.id)} />
              </div>
            )}
          />
        </>
      ) : (
        <>
          <Button size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> New allocation
          </Button>

          <BigRowList
            rows={rows}
            keyFor={({ allocation }) => allocation.id}
            icon={Package}
            iconTone="good"
            title={({ allocation }) => allocation.label}
            subtitle={({ product, stats }) => `${product?.name ?? "Unknown"} · ${formatNumber(stats.used)} used`}
            trailing={({ stats }) => `${formatNumber(stats.remaining)} left`}
            trailingTone={({ stats }) => (stats.remaining <= 0 ? "warning" : "good")}
            onSelect={({ allocation }) => setEditing(allocation)}
            onDelete={({ allocation }) => deleteAllocation(allocation.id)}
            emptyMessage="No allocations yet."
          />
        </>
      )}

      {addOpen && <AllocationDialog allocation={null} onClose={() => setAddOpen(false)} onSave={(patch) => addAllocation({ ...patch, eventId: null })} />}

      {editing && (
        <AllocationDialog
          key={editing.id}
          allocation={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => updateAllocation(editing.id, patch)}
          onDelete={() => deleteAllocation(editing.id)}
        />
      )}
    </div>
  );
}
