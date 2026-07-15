"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Pencil, Plus } from "lucide-react";
import { SalesDetail } from "@/components/summary/sales-detail";
import { QuickEditDialog } from "@/components/home/quick-edit-dialog";
import { StatTile } from "@/components/data-table/stat-tile";
import { Toolbar } from "@/components/data-table/toolbar";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { BigRowList } from "@/components/data-table/big-row-list";
import { SeeAllLink } from "@/components/data-table/see-all-link";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store/use-store";
import { addEntry, deleteEntry, replaceEntry } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { entryToDraft } from "@/lib/home/describe-entry";
import { computeSalesSummary } from "@/lib/summary/sales-summary";
import { currentMonthLabel, formatDate, formatPeso, PRICE_TYPE_LABELS } from "@/lib/format";
import { useViewMode } from "@/lib/summary/view-mode";
import type { Entry } from "@/lib/store/types";

const PRICE_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  ...Object.entries(PRICE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const SIMPLE_ROW_CAP = 8;

export default function SalesPage() {
  const { entries, products, rawMaterials } = useStore();
  const [viewMode] = useViewMode();
  const summary = useMemo(
    () => computeSalesSummary(entries, products, rawMaterials),
    [entries, products, rawMaterials],
  );

  const [search, setSearch] = useState("");
  const [priceTypeFilter, setPriceTypeFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => e.type === "SALE")
      .filter((e) => priceTypeFilter === "all" || (e.priceType ?? "standard") === priceTypeFilter)
      .filter((e) => !q || e.sku?.toLowerCase().includes(q) || e.counterparty?.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [entries, search, priceTypeFilter]);

  const columns: DataTableColumn<Entry>[] = [
    { key: "date", header: "Date", render: (e) => formatDate(e.timestamp) },
    {
      key: "item",
      header: "Item",
      render: (e) => (
        <div>
          <p className="font-medium text-foreground">{e.sku ?? "Sale"}</p>
          {e.counterparty && <p className="text-xs text-muted-foreground">{e.counterparty}</p>}
        </div>
      ),
    },
    { key: "qty", header: "Qty", align: "right", render: (e) => (e.quantity ?? "—").toString() },
    { key: "amount", header: "Amount", align: "right", render: (e) => formatPeso(e.amount) },
    { key: "priceType", header: "Type", render: (e) => PRICE_TYPE_LABELS[e.priceType ?? "standard"] ?? "—" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-foreground">Sales</h1>
        <p className="text-sm text-muted-foreground">{currentMonthLabel()}</p>
      </div>

      {viewMode === "advanced" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Revenue" value={formatPeso(summary.revenue)} sub="this month" tone="good" />
            <StatTile label="Jars sold" value={String(summary.jarsSold)} sub="this month" />
            <StatTile label="Avg / jar" value={formatPeso(summary.avgPerJar)} />
            <StatTile label="Gross margin" value={`${Math.round(summary.grossMarginPct)}%`} />
          </div>

          <Toolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by item or buyer…"
            filters={[
              { label: "Price type", value: priceTypeFilter, options: PRICE_TYPE_FILTER_OPTIONS, onChange: setPriceTypeFilter },
            ]}
            onAdd={() => setAddOpen(true)}
            addLabel="Add sale"
          />

          <DataTable
            columns={columns}
            rows={filtered}
            keyFor={(e) => e.id}
            emptyMessage="No sales logged yet."
            renderRowActions={(e) => (
              <div className="flex items-center justify-end gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Edit sale" onClick={() => setEditingEntry(e)}>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
                <ConfirmDeleteButton onConfirm={() => deleteEntry(e.id)} />
              </div>
            )}
          />
        </>
      ) : (
        <>
          <Button size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add sale
          </Button>

          <BigRowList
            rows={filtered.slice(0, SIMPLE_ROW_CAP)}
            keyFor={(e) => e.id}
            icon={ArrowUpRight}
            iconTone="good"
            title={(e) => e.sku ?? "Sale"}
            subtitle={(e) => `${formatDate(e.timestamp)}${e.counterparty ? ` · ${e.counterparty}` : ""}`}
            trailing={(e) => `+${formatPeso(e.amount)}`}
            trailingTone="good"
            onSelect={(e) => setEditingEntry(e)}
            emptyMessage="No sales logged yet."
          />

          {filtered.length > 0 && <SeeAllLink label="See all sales" />}
        </>
      )}

      <SalesDetail />

      <QuickEditDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add sale"
        initial={blankEntryDraft("SALE")}
        lockType
        onSave={(draft) => addEntry(draft)}
      />

      {editingEntry && (
        <QuickEditDialog
          open
          onOpenChange={(o) => !o && setEditingEntry(null)}
          title="Edit sale"
          initial={entryToDraft(editingEntry)}
          lockType
          onSave={(draft) => replaceEntry(editingEntry.id, draft)}
        />
      )}
    </div>
  );
}
