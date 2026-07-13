"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { addRawMaterial, updateRawMaterial } from "@/lib/store/store";
import { procurementHistoryFor, weightedAverageUnitCost } from "@/lib/summary/procurement";
import { formatPeso } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function AddIngredientForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [unitCost, setUnitCost] = useState(0);

  function save() {
    if (!name.trim()) return;
    addRawMaterial({
      name: name.trim(),
      unit,
      qty: 0,
      lowStockThreshold: 0,
      perBatchQty: null,
      color: null,
      unitCost,
    });
    onDone();
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-2.5">
      <div className="grid grid-cols-3 gap-2">
        <Input
          placeholder="Ingredient name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="col-span-3 h-8 text-sm"
        />
        <Input placeholder="Unit (kg, pcs...)" value={unit} onChange={(e) => setUnit(e.target.value)} className="h-8 text-sm" />
        <Input
          type="number"
          placeholder="Cost per unit (₱)"
          value={unitCost}
          onChange={(e) => setUnitCost(Number(e.target.value) || 0)}
          className="col-span-2 h-8 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={save} disabled={!name.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" className="flex-1" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function IngredientCostsPanel() {
  const { entries, rawMaterials } = useStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      <button type="button" onClick={() => setShowDetails((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <div>
          <p className="text-sm font-semibold text-foreground">Ingredient costs</p>
          <p className="text-xs text-muted-foreground">
            {rawMaterials.length} ingredient{rawMaterials.length === 1 ? "" : "s"} tracked — tap to review costs
          </p>
        </div>
        {showDetails ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {showDetails && (
        <>
          <p className="text-xs text-muted-foreground">
            Set each ingredient&apos;s cost once here — every product below uses these live, so a price change updates
            every product that uses it automatically.
          </p>

          <div className="space-y-2">
            {rawMaterials.map((material) => {
          const suggestion = weightedAverageUnitCost(procurementHistoryFor(entries, material.name));
          const suggestionDiffers = suggestion != null && Math.round(suggestion * 100) !== Math.round(material.unitCost * 100);
          return (
            <div key={material.id} className="space-y-1 rounded-xl border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{material.name}</span>
                <span className="text-xs text-muted-foreground">per {material.unit}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">₱</span>
                <Input
                  type="number"
                  className="h-8 flex-1"
                  value={material.unitCost}
                  onChange={(e) => updateRawMaterial(material.id, { unitCost: Number(e.target.value) || 0 })}
                />
              </div>
              {suggestionDiffers && (
                <button
                  type="button"
                  onClick={() => updateRawMaterial(material.id, { unitCost: Math.round(suggestion! * 100) / 100 })}
                  className="text-[11px] text-muted-foreground underline decoration-dotted"
                >
                  Use {formatPeso(suggestion!)} — average of your logged purchases
                </button>
              )}
            </div>
              );
            })}
          </div>

          {showAddForm ? (
            <AddIngredientForm onDone={() => setShowAddForm(false)} />
          ) : (
            <Button size="sm" variant="ghost" className="w-full gap-1 text-xs text-muted-foreground" onClick={() => setShowAddForm(true)}>
              <Plus className="h-3.5 w-3.5" /> Add ingredient
            </Button>
          )}
        </>
      )}
    </div>
  );
}
