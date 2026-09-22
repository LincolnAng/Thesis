import { convertQuantity } from "@/lib/units";
import type { RawMaterialStock, Supplier, SupplierPrice } from "@/lib/store/types";

export interface SupplierIngredientCost {
  key: string;
  materialId: string;
  materialName: string;
  unit: string;
  supplierId: string;
  supplierName: string;
  /** Mean cost per one of the material's own unit, across every purchase logged. */
  avgUnitCost: number;
  lastUnitCost: number;
  lastPaid: number;
  lastQuantity: number;
  lastQuantityUnit: string;
  lastLoggedAt: string;
  purchases: number;
}

/**
 * Average cost per unit of each ingredient, per supplier, from every price logged. Each price
 * is converted into the material's own unit first (₱450 for 2 kg and ₱120 for 500 g compare
 * as ₱/kg), so purchases in different sizes average correctly. Prices in a unit that can't
 * convert are left out rather than guessed.
 */
export function averageIngredientCosts(
  supplierPrices: SupplierPrice[],
  suppliers: Supplier[],
  rawMaterials: RawMaterialStock[],
): SupplierIngredientCost[] {
  const groups = new Map<string, { material: RawMaterialStock; supplierId: string; rows: { unitCost: number; p: SupplierPrice }[] }>();

  for (const p of supplierPrices) {
    const material = rawMaterials.find((m) => m.id === p.materialId);
    if (!material || p.quantity <= 0) continue;
    const qty = convertQuantity(p.quantity, p.unit, material.unit);
    if (qty === null || qty <= 0) continue;
    const key = `${p.materialId}|${p.supplierId}`;
    const group = groups.get(key) ?? { material, supplierId: p.supplierId, rows: [] };
    group.rows.push({ unitCost: p.price / qty, p });
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, g]) => {
      const sorted = [...g.rows].sort((a, b) => b.p.loggedAt.localeCompare(a.p.loggedAt));
      const last = sorted[0];
      return {
        key,
        materialId: g.material.id,
        materialName: g.material.name,
        unit: g.material.unit,
        supplierId: g.supplierId,
        supplierName: suppliers.find((s) => s.id === g.supplierId)?.name ?? "Unknown supplier",
        avgUnitCost: g.rows.reduce((sum, r) => sum + r.unitCost, 0) / g.rows.length,
        lastUnitCost: last.unitCost,
        lastPaid: last.p.price,
        lastQuantity: last.p.quantity,
        lastQuantityUnit: last.p.unit,
        lastLoggedAt: last.p.loggedAt,
        purchases: g.rows.length,
      };
    })
    .sort((a, b) => a.materialName.localeCompare(b.materialName) || a.avgUnitCost - b.avgUnitCost);
}
