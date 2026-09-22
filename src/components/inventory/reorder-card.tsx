"use client";

import Link from "next/link";
import { Phone, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber, formatPeso } from "@/lib/format";
import { getUnitCost } from "@/lib/summary/cost-engine";
import { useStore } from "@/lib/store/use-store";
import type { IngredientReach } from "@/lib/summary/ingredient-reach";

/**
 * Stock knows an ingredient is low. Suppliers knows who sells it and what they charged
 * last. Those two facts sat on different pages with nothing joining them, so acting on a
 * low-stock warning meant remembering a name and navigating away.
 *
 * The supplier_prices rows the cost engine already needs are the join — whoever last priced
 * this ingredient is who to call.
 */
export function ReorderCard({ reach }: { reach: IngredientReach }) {
  const { suppliers, supplierPrices, rawMaterials } = useStore();
  const material = reach.material;

  const latestPrice = supplierPrices
    .filter((p) => p.materialId === material.id)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[0];
  const supplier = latestPrice ? suppliers.find((s) => s.id === latestPrice.supplierId) : undefined;

  const unitCost = getUnitCost(material.id, rawMaterials, supplierPrices);
  const previous = supplierPrices
    .filter((p) => p.materialId === material.id)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[1];
  const rose = previous && latestPrice && latestPrice.price / latestPrice.quantity > previous.price / previous.quantity;

  const reason = reach.belowReorderPoint
    ? `at its restock point of ${formatNumber(material.reorderPoint ?? 0)} ${material.unit}`
    : reach.daysLeft != null
      ? `about ${reach.daysLeft} days left`
      : `${formatNumber(material.qty)} ${material.unit} left`;

  // Pre-fills the expense so logging the purchase is one screen, not a form from scratch.
  const draft = `Bought ${material.name} from ${supplier?.name ?? "supplier"} for ${Math.round(unitCost.cost)}`;

  return (
    <div className="space-y-3 rounded-[var(--radius-panel)] border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/5 p-4">
      <div className="flex items-start gap-2.5">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-warning)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {material.name} running low — {formatNumber(material.qty)} {material.unit} left
          </p>
          <p className="type-meta">{reason}</p>
        </div>
      </div>

      {supplier ? (
        <>
          <p className="text-sm text-foreground">
            <span className="font-medium">{supplier.name}</span>
            <span className="text-muted-foreground">
              {" · "}
              {formatPeso(unitCost.cost)}/{material.unit}
              {rose && previous && (
                <> (up from {formatPeso(previous.price / previous.quantity)})</>
              )}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {supplier.contact && (
              <a href={`tel:${supplier.contact.replace(/\s/g, "")}`}>
                <Button size="sm" variant="secondary" className="gap-1">
                  <Phone className="h-3.5 w-3.5" /> Call
                </Button>
              </a>
            )}
            <Link href={`/chat?draft=${encodeURIComponent(draft)}`}>
              <Button size="sm">Log a purchase</Button>
            </Link>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No supplier has priced {material.name} yet. Log a price on the Suppliers page and this becomes one tap.
        </p>
      )}
    </div>
  );
}
