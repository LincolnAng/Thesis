"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Users } from "lucide-react";
import { StatTile } from "@/components/data-table/stat-tile";
import { Toolbar } from "@/components/data-table/toolbar";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { BigRowList } from "@/components/data-table/big-row-list";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { CustomerDialog } from "@/components/customers/customer-dialog";
import { useStore } from "@/lib/store/use-store";
import { addCustomer, deleteCustomer, updateCustomer } from "@/lib/store/store";
import { formatDate, formatPeso } from "@/lib/format";
import { customerStats } from "@/lib/summary/customer-summary";
import { useViewMode } from "@/lib/summary/view-mode";
import type { Customer } from "@/lib/store/types";

export default function CustomersPage() {
  const { customers, entries } = useStore();
  const [viewMode] = useViewMode();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers
      .map((c) => ({ customer: c, stats: customerStats(c, entries) }))
      .filter(({ customer }) => !q || customer.name.toLowerCase().includes(q))
      .sort((a, b) => b.stats.totalSpent - a.stats.totalSpent);
  }, [customers, entries, search]);

  const totalSpentAllCustomers = rows.reduce((sum, r) => sum + r.stats.totalSpent, 0);

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    {
      key: "name",
      header: "Customer",
      render: ({ customer }) => (
        <div>
          <p className="font-medium text-foreground">{customer.name}</p>
          {customer.contact && <p className="text-xs text-muted-foreground">{customer.contact}</p>}
        </div>
      ),
    },
    { key: "orders", header: "Orders", align: "right", render: ({ stats }) => String(stats.orderCount) },
    { key: "spent", header: "Total spent", align: "right", render: ({ stats }) => formatPeso(stats.totalSpent) },
    {
      key: "last",
      header: "Last order",
      render: ({ stats }) => (stats.lastOrderAt ? formatDate(stats.lastOrderAt) : "—"),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-foreground">Customers</h1>
        <p className="text-sm text-muted-foreground">{customers.length} tracked</p>
      </div>

      {viewMode === "advanced" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Customers" value={String(customers.length)} />
            <StatTile label="Total spent" value={formatPeso(totalSpentAllCustomers)} tone="good" />
            <StatTile
              label="Avg per customer"
              value={formatPeso(customers.length > 0 ? totalSpentAllCustomers / customers.length : 0)}
            />
          </div>

          <Toolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search customers…"
            onAdd={() => setAddOpen(true)}
            addLabel="Add customer"
          />

          <DataTable
            columns={columns}
            rows={rows}
            keyFor={({ customer }) => customer.id}
            emptyMessage="No customers yet."
            renderRowActions={({ customer }) => (
              <div className="flex items-center justify-end gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Edit customer" onClick={() => setEditing(customer)}>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
                <ConfirmDeleteButton onConfirm={() => deleteCustomer(customer.id)} />
              </div>
            )}
          />
        </>
      ) : (
        <>
          <Button size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add customer
          </Button>

          <BigRowList
            rows={rows}
            keyFor={({ customer }) => customer.id}
            icon={Users}
            iconTone="good"
            title={({ customer }) => customer.name}
            subtitle={({ stats }) => `${stats.orderCount} order${stats.orderCount === 1 ? "" : "s"}`}
            trailing={({ stats }) => formatPeso(stats.totalSpent)}
            trailingTone="good"
            onSelect={({ customer }) => setEditing(customer)}
            onDelete={({ customer }) => deleteCustomer(customer.id)}
            emptyMessage="No customers yet."
          />
        </>
      )}

      {addOpen && (
        <CustomerDialog customer={null} onClose={() => setAddOpen(false)} onSave={(patch) => addCustomer(patch)} />
      )}

      {editing && (
        <CustomerDialog
          key={editing.id}
          customer={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => updateCustomer(editing.id, patch)}
          onDelete={() => deleteCustomer(editing.id)}
        />
      )}
    </div>
  );
}
