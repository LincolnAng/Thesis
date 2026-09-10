"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useMemo, useState } from "react";
import { ArrowUpRight, Pencil, Receipt } from "lucide-react";
import { SalesDetail } from "@/components/summary/sales-detail";
import { MissingProductBanner } from "@/components/sales/missing-product-banner";
import { QuickEditDialog } from "@/components/home/quick-edit-dialog";
import { StatGrid, StatTile } from "@/components/data-table/stat-tile";
import { DeltaBadge } from "@/components/data-table/delta-badge";
import { ActionCard } from "@/components/layout/action-card";
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
import { currentMonthLabel, emptyPeriodReason, formatDate, formatPeso, previousMonthShortLabel, PRICE_TYPE_LABELS } from "@/lib/format";
import { useViewMode } from "@/lib/summary/view-mode";
import { useCostContext } from "@/lib/summary/use-cost-context";
import type { Entry } from "@/lib/store/types";

const PRICE_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  ...Object.entries(PRICE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const SIMPLE_ROW_CAP = 8;

export default function SalesPage() {
  const { entries, products } = useStore();
  const [viewMode] = useViewMode();
  const costCtx = useCostContext();
  const summary = useMemo(
    () => computeSalesSummary(entries, products, costCtx),
    [entries, products, costCtx],
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

  const lastSale = entries
    .filter((e) => e.type === "SALE")
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  const emptyReason =
    summary.revenue === 0 && lastSale ? emptyPeriodReason(lastSale.timestamp, currentMonthLabel()) : null;

  const columns: DataTableColumn<Entry>[] = [
    {
      key: "date",
      header: "Date",
      render: (e) => formatDate(e.timestamp),
      sortValue: (e) => e.timestamp,
      exportValue: (e) => e.timestamp.slice(0, 10),
    },
    {
      key: "item",
      header: "Item",
      render: (e) => <p className="truncate-line font-medium text-foreground">{e.sku ?? "Sale"}</p>,
      sortValue: (e) => e.sku ?? "",
      exportValue: (e) => e.sku ?? "",
      total: () => "Total",
    },
    {
      key: "buyer",
      header: "Buyer",
      // Its own column rather than a sub-line under the item — who bought it reads as
      // primary information, not as a caption on the product name.
      render: (e) =>
        e.counterparty ? (
          <p className="truncate-line font-medium text-foreground">{e.counterparty}</p>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortValue: (e) => e.counterparty ?? "",
      exportValue: (e) => e.counterparty ?? "",
    },
    {
      key: "qty",
      header: "Qty",
      align: "right",
      render: (e) => (e.quantity ?? "—").toString(),
      sortValue: (e) => e.quantity ?? 0,
      exportValue: (e) => e.quantity ?? "",
      total: (rows) => rows.reduce((sum, e) => sum + (e.quantity ?? 0), 0),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (e) => formatPeso(e.amount),
      sortValue: (e) => e.amount ?? 0,
      exportValue: (e) => e.amount ?? "",
      total: (rows) => formatPeso(rows.reduce((sum, e) => sum + (e.amount ?? 0), 0)),
    },
    {
      key: "priceType",
      header: "Type",
      render: (e) => PRICE_TYPE_LABELS[e.priceType ?? "standard"] ?? "—",
      sortValue: (e) => e.priceType ?? "standard",
      exportValue: (e) => e.priceType ?? "standard",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader icon={Receipt} title="Sales" meta={currentMonthLabel()} />

      <MissingProductBanner sales={entries.filter((e) => e.type === "SALE")} />

      {viewMode === "simple" && (
        <ActionCard
          icon={ArrowUpRight}
          title={
            <>
              <span className="font-semibold">{formatPeso(summary.revenue)}</span> sold this month
            </>
          }
          action={
            <Button size="sm" onClick={() => setAddOpen(true)}>
              Add sale
            </Button>
          }
        />
      )}

      {emptyReason && <p className="text-sm text-muted-foreground">{emptyReason}</p>}

      {viewMode === "advanced" ? (
        <>
          <StatGrid>
            <StatTile
              label="Revenue"
              value={formatPeso(summary.revenue)}
              sub={currentMonthLabel()}
              tone="good"
              delta={<DeltaBadge pct={summary.revenueChangePct} comparedTo={previousMonthShortLabel()} />}
            />
            <StatTile
              label="Orders"
              value={String(summary.orderCount)}
              sub={currentMonthLabel()}
              delta={<DeltaBadge pct={summary.orderCountChangePct} comparedTo={previousMonthShortLabel()} />}
            />
            <StatTile label="Avg order value" value={formatPeso(summary.avgOrderValue)} sub={currentMonthLabel()} />
            <StatTile
              label="Jars sold"
              value={String(summary.jarsSold)}
              sub={currentMonthLabel()}
              delta={<DeltaBadge pct={summary.jarsChangePct} comparedTo={previousMonthShortLabel()} />}
            />
            <StatTile label="Avg / jar" value={formatPeso(summary.avgPerJar)} sub={currentMonthLabel()} />
            <StatTile label="Gross margin" value={`${Math.round(summary.grossMarginPct)}%`} sub={currentMonthLabel()} />
            <StatTile label="COGS" value={`${Math.round(summary.cogsPct)}%`} sub="of revenue" tone="warning" />
            <StatTile label="Profit" value={formatPeso(summary.profit)} sub={currentMonthLabel()} tone="good" />
          </StatGrid>

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
            exportName={`sales-${currentMonthLabel().toLowerCase().replace(" ", "-")}`}
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
          <BigRowList
            rows={filtered.slice(0, SIMPLE_ROW_CAP)}
            keyFor={(e) => e.id}
            icon={ArrowUpRight}
            iconTone="good"
            title={(e) => e.sku ?? "Sale"}
            subtitle={(e) =>
              e.counterparty ? (
                <>
                  <span className="font-medium text-foreground">{e.counterparty}</span>
                  <span className="text-muted-foreground"> · {formatDate(e.timestamp)}</span>
                </>
              ) : (
                formatDate(e.timestamp)
              )
            }
            trailing={(e) => `+${formatPeso(e.amount)}`}
            trailingTone="good"
            onSelect={(e) => setEditingEntry(e)}
            onDelete={(e) => deleteEntry(e.id)}
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
          onDelete={() => deleteEntry(editingEntry.id)}
        />
      )}
    </div>
  );
}
