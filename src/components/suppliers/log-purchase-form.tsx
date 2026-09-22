"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";
import { addSupplierPrice, updateSupplier } from "@/lib/store/store";
import type { RawMaterialStock, Supplier } from "@/lib/store/types";

const field = "rounded-lg border border-line/20 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-cacao";

/**
 * What a supplier charged for one ingredient: amount paid and how much it bought. This is the
 * price record product costs are built from, so logging it here updates every margin that
 * uses the ingredient.
 */
export function LogPurchaseForm({ supplier, materials }: { supplier: Supplier; materials: RawMaterialStock[] }) {
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [paid, setPaid] = useState("");
  const [qty, setQty] = useState("");
  const [saved, setSaved] = useState(false);
  const material = materials.find((m) => m.id === materialId);
  const valid = !!material && Number(paid) > 0 && Number(qty) > 0;

  function save() {
    if (!valid || !material) return;
    addSupplierPrice({ supplierId: supplier.id, materialId: material.id, price: Number(paid), quantity: Number(qty), unit: material.unit });
    // Keep the supplier's own last-price line (and its history chart) in step.
    updateSupplier(supplier.id, { lastPrice: Number(paid) });
    setPaid("");
    setQty("");
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line/10 bg-white p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span className="text-[13px] font-semibold text-foreground">Log a purchase</span>
        <span className="flex items-center gap-4">
          {supplier.contact && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" /> {supplier.contact}
            </span>
          )}
          <Link href={`/transactions?supplier=${encodeURIComponent(supplier.name)}`} className="font-semibold text-cacao">
            See spending
          </Link>
        </span>
      </div>
      {materials.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">Add raw materials in Inventory first, then log what this supplier charged.</div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <select className={field} value={materialId} onChange={(e) => setMaterialId(e.target.value)} aria-label="Ingredient">
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground">paid ₱</span>
          <input className={`${field} w-24`} type="number" inputMode="decimal" value={paid} onChange={(e) => (setPaid(e.target.value), setSaved(false))} aria-label="Amount paid" />
          <span className="text-muted-foreground">for</span>
          <input className={`${field} w-20`} type="number" inputMode="decimal" value={qty} onChange={(e) => (setQty(e.target.value), setSaved(false))} aria-label="Quantity" />
          <span className="text-muted-foreground">{material?.unit ?? ""}</span>
          <button type="button" onClick={save} disabled={!valid} className="ml-auto rounded-lg bg-cacao px-3.5 py-1.5 text-xs font-semibold text-ivory disabled:opacity-40">
            Save
          </button>
          {saved && <span className="text-xs font-semibold text-success">Saved — costs updated</span>}
        </div>
      )}
    </div>
  );
}
