"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { BackToSummaryLink } from "@/components/summary/back-to-summary-link";
import { SupplierCard } from "@/components/suppliers/supplier-card";
import { AddSupplierForm } from "@/components/suppliers/add-supplier-form";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store/use-store";

export default function SuppliersPage() {
  const { suppliers } = useStore();
  const rawMaterials = suppliers.filter((s) => s.type === "raw_materials");
  const packaging = suppliers.filter((s) => s.type === "packaging");
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-2">
        <BackToSummaryLink />
        <Button size="sm" variant="secondary" className="gap-1" onClick={() => setShowAddForm((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> Add supplier
        </Button>
      </div>
      <h1 className="mb-4 text-xl font-bold text-foreground">Suppliers</h1>

      {showAddForm && (
        <div className="mb-6">
          <AddSupplierForm onDone={() => setShowAddForm(false)} />
        </div>
      )}

      <div className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Ingredients</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rawMaterials.map((s) => (
            <SupplierCard key={s.id} supplier={s} />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Packaging</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {packaging.map((s) => (
            <SupplierCard key={s.id} supplier={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
