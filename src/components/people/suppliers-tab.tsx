"use client";

import { useMemo, useState } from "react";
import { PeopleSummary, PeopleTable } from "@/components/people/people-table";
import { LogPurchaseForm } from "@/components/suppliers/log-purchase-form";
import { AddSupplierForm } from "@/components/suppliers/add-supplier-form";
import { averageIngredientCosts } from "@/lib/summary/supplier-costs";
import { isRawCacao } from "@/lib/summary/cacao";
import { useStore } from "@/lib/store/use-store";
import { formatPeso } from "@/lib/format";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Unit prices keep their centavos (₱8.40, not ₱8.4). */
function unitPrice(n: number) {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? formatPeso(r) : `₱${r.toFixed(2)}`;
}

export function SuppliersTab() {
  const { suppliers, supplierPrices, rawMaterials, entries } = useStore();
  const [showAddForm, setShowAddForm] = useState(false);

  const costs = useMemo(() => averageIngredientCosts(supplierPrices, suppliers, rawMaterials), [supplierPrices, suppliers, rawMaterials]);
  const spentWith = (name: string) =>
    entries
      .filter((e) => e.type === "EXPENSE" && (e.counterparty ?? "").toLowerCase() === name.toLowerCase())
      .reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalSpent = suppliers.reduce((s, x) => s + spentWith(x.name), 0);
  const cacao = costs.filter((c) => isRawCacao(c.materialName));
  const avgCacao = cacao.length ? cacao.reduce((s, c) => s + c.avgUnitCost, 0) / cacao.length : null;

  return (
    <>
      <PeopleSummary
        items={[
          { label: "Suppliers", value: String(suppliers.length) },
          { label: "Spent with suppliers", value: formatPeso(totalSpent) },
          { label: "Avg cacao price", value: avgCacao !== null ? `${unitPrice(avgCacao)} / ${cacao[0].unit}` : "—" },
        ]}
        right={
          <button type="button" onClick={() => setShowAddForm((v) => !v)} className="rounded-[10px] bg-cacao px-4 py-2.5 text-[13px] font-semibold text-ivory">
            {showAddForm ? "Cancel" : "+ Add supplier"}
          </button>
        }
      />
      {showAddForm && (
        <div className="mb-4">
          <AddSupplierForm onDone={() => setShowAddForm(false)} />
        </div>
      )}
      <PeopleTable
        columns={[
          { label: "Supplier", width: "1.4fr" },
          { label: "Supplies", width: "1.4fr" },
          { label: "Last price", align: "right" },
          { label: "Avg price", align: "right" },
          { label: "Last bought", align: "right" },
        ]}
        empty="No suppliers yet — add one to start logging what you pay."
        rows={suppliers.map((s) => {
          const mine = costs.filter((c) => c.supplierId === s.id).sort((a, b) => b.lastLoggedAt.localeCompare(a.lastLoggedAt));
          const main = mine[0];
          return {
            key: s.id,
            cells: [
              <span key="n" className="font-semibold">
                {s.name}
              </span>,
              <span key="g" className="truncate text-muted-foreground">
                {main ? main.materialName : s.items || "—"}
                {mine.length > 1 && ` +${mine.length - 1}`}
              </span>,
              main ? (
                <span key="l" className="font-semibold">
                  {main.lastUnitCost > main.avgUnitCost + 0.005 && <span className="mr-1 text-xs text-danger">↑</span>}
                  {main.lastUnitCost < main.avgUnitCost - 0.005 && <span className="mr-1 text-xs text-success">↓</span>}
                  {unitPrice(main.lastUnitCost)} / {main.unit}
                </span>
              ) : s.lastPrice ? (
                formatPeso(s.lastPrice)
              ) : (
                "—"
              ),
              main ? `${unitPrice(main.avgUnitCost)} / ${main.unit}` : "—",
              main ? shortDate(main.lastLoggedAt) : "—",
            ],
            detail: (
              <div className="flex flex-col gap-3 py-2">
                {mine.length > 0 && (
                  <div className="flex flex-col gap-1.5 text-[12px]">
                    {mine.map((c) => (
                      <div key={c.key} className="grid grid-cols-[1fr_auto_auto] gap-4">
                        <span>{c.materialName}</span>
                        <span className="text-muted-foreground">
                          last {formatPeso(c.lastPaid)} for {c.lastQuantity} {c.lastQuantityUnit} · {c.purchases} purchase{c.purchases === 1 ? "" : "s"}
                        </span>
                        <span className="font-semibold">
                          avg {unitPrice(c.avgUnitCost)} / {c.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <LogPurchaseForm supplier={s} materials={rawMaterials} />
              </div>
            ),
          };
        })}
      />
    </>
  );
}
