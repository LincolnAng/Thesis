"use client";

import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { StatTile } from "@/components/data-table/stat-tile";
import { Toolbar } from "@/components/data-table/toolbar";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { BigRowList } from "@/components/data-table/big-row-list";
import { CustomerDetailDialog } from "@/components/customers/customer-detail-dialog";
import { useStore } from "@/lib/store/use-store";
import { formatDate, formatNumber, formatPeso } from "@/lib/format";
import { customerKey, deriveCustomers, type DerivedCustomer } from "@/lib/summary/customers";
import { useViewMode } from "@/lib/summary/view-mode";

export default function CustomersPage() {
  const { entries } = useStore();
  const [viewMode] = useViewMode();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DerivedCustomer | null>(null);

  const customers = useMemo(() => deriveCustomers(entries), [entries]);
  const filtered = useMemo(() => {
    const q = customerKey(search);
    return q ? customers.filter((c) => c.key.includes(q)) : customers;
  }, [customers, search]);

  const totalSpent = customers.reduce((sum, c) => sum + c.totalSpent, 0);
  const topCustomer = customers[0];

  const columns: DataTableColumn<DerivedCustomer>[] = [
    {
      key: "name",
      header: "Customer",
      render: (c) => (
        <div>
          <p className="font-medium text-foreground">{c.name}</p>
          {c.spellings.length > 1 && (
            <p className="text-xs text-muted-foreground">also spelled {c.spellings.filter((s) => s !== c.name).join(", ")}</p>
          )}
        </div>
      ),
    },
    {
      key: "buys",
      header: "Usually buys",
      render: (c) => <span className="text-muted-foreground">{c.purchases[0]?.sku ?? "—"}</span>,
    },
    { key: "orders", header: "Orders", align: "right", render: (c) => formatNumber(c.orderCount) },
    { key: "spent", header: "Total spent", align: "right", render: (c) => formatPeso(c.totalSpent) },
    {
      key: "last",
      header: "Last order",
      render: (c) => (c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-foreground">Customers</h1>
        <p className="text-sm text-muted-foreground">{customers.length} tracked</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Built automatically from every sale you&apos;ve logged — no separate list to maintain. Names are matched
        ignoring capitalization and extra spaces, so one buyer stays one customer.
      </p>

      {viewMode === "advanced" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Customers" value={String(customers.length)} />
            <StatTile label="Total sales" value={formatPeso(totalSpent)} tone="good" />
            <StatTile label="Top customer" value={topCustomer?.name ?? "—"} sub={topCustomer ? formatPeso(topCustomer.totalSpent) : undefined} />
          </div>

          <Toolbar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search customers…" />

          <DataTable
            columns={columns}
            rows={filtered}
            keyFor={(c) => c.key}
            emptyMessage="No customers yet — they'll appear here as soon as you log a sale with a buyer name."
          />
        </>
      ) : (
        <BigRowList
          rows={filtered}
          keyFor={(c) => c.key}
          icon={Users}
          iconTone="good"
          title={(c) => c.name}
          subtitle={(c) => `${c.orderCount} ${c.orderCount === 1 ? "order" : "orders"} · ${c.purchases[0]?.sku ?? "—"}`}
          trailing={(c) => formatPeso(c.totalSpent)}
          trailingTone="good"
          onSelect={(c) => setSelected(c)}
          emptyMessage="No customers yet — they'll appear here as soon as you log a sale with a buyer name."
        />
      )}

      {selected && <CustomerDetailDialog customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
