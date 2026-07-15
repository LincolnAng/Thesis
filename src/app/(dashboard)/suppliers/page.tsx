"use client";

import { useMemo, useState } from "react";
import { SupplierCard } from "@/components/suppliers/supplier-card";
import { AddSupplierForm } from "@/components/suppliers/add-supplier-form";
import { Toolbar } from "@/components/data-table/toolbar";
import { useStore } from "@/lib/store/use-store";
import { useViewMode } from "@/lib/summary/view-mode";

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "raw_materials", label: "Ingredients" },
  { value: "packaging", label: "Packaging" },
];

export default function SuppliersPage() {
  const { suppliers } = useStore();
  const [viewMode] = useViewMode();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers
      .filter((s) => typeFilter === "all" || s.type === typeFilter)
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.items.toLowerCase().includes(q));
  }, [suppliers, search, typeFilter]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <h1 className="text-xl font-bold text-foreground">Suppliers</h1>

      <Toolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search suppliers or items…"
        filters={
          viewMode === "advanced"
            ? [{ label: "Type", value: typeFilter, options: TYPE_FILTER_OPTIONS, onChange: setTypeFilter }]
            : undefined
        }
        onAdd={() => setShowAddForm((v) => !v)}
        addLabel="Add supplier"
      />

      {showAddForm && <AddSupplierForm onDone={() => setShowAddForm(false)} />}

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          No suppliers match.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((s) => (
            <SupplierCard key={s.id} supplier={s} />
          ))}
        </div>
      )}
    </div>
  );
}
