"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";
import { StatusChip } from "@/components/ui/status-symbol";
import { SparklineCell } from "@/components/data-table/sparkline-cell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/format";
import { updateSupplier } from "@/lib/store/store";
import type { Supplier } from "@/lib/store/types";
import { PriceHistoryChart } from "@/components/suppliers/price-history-chart";
import { useViewMode } from "@/lib/summary/view-mode";

export function SupplierCard({ supplier }: { supplier: Supplier }) {
  const [newPrice, setNewPrice] = useState("");
  const [viewMode] = useViewMode();
  const history = supplier.priceHistory;
  const priceRose = history.length >= 2 && history[history.length - 1].price > history[history.length - 2].price;
  const previousPrice = history.length >= 2 ? history[history.length - 2].price : null;

  function logNewPrice() {
    const value = Number(newPrice);
    if (!value || value <= 0) return;
    updateSupplier(supplier.id, { lastPrice: value });
    setNewPrice("");
  }

  return (
    <Card>
      <CardContent className="space-y-3 px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="truncate-line font-semibold text-foreground" title={supplier.name}>
              {supplier.name}
            </p>
            <p className="text-xs text-muted-foreground">{supplier.items}</p>
          </div>
          {priceRose && <StatusChip kind="info">Price rose</StatusChip>}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm">
            Last price: <span className="font-bold text-foreground">{formatPeso(supplier.lastPrice)}</span>
            {priceRose && previousPrice !== null && (
              <span className="text-muted-foreground"> (was {formatPeso(previousPrice)})</span>
            )}
          </p>
          {/* The trend, inline. The full chart is still one click away in Advanced. */}
          <SparklineCell points={history.map((h) => h.price)} tone={priceRose ? "warning" : "good"} />
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="h-3.5 w-3.5" /> {supplier.contact}
        </div>

        {viewMode === "advanced" && <PriceHistoryChart history={history} />}

        <Link
          href={`/expenses?supplier=${encodeURIComponent(supplier.name)}`}
          className="inline-block text-xs font-medium text-primary underline decoration-dotted"
        >
          See spending with {supplier.name}
        </Link>

        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Log new price paid"
            className="h-8 text-xs"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
          />
          <Button size="sm" className="h-8" onClick={logNewPrice}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
