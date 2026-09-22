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
    <Card className="h-full gap-0 py-0">
      <CardContent className="flex h-full flex-col gap-4 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate-line font-semibold text-foreground" title={supplier.name}>
              {supplier.name}
            </p>
            <p className="truncate-line text-xs text-muted-foreground">{supplier.items}</p>
          </div>
          {priceRose && (
            <span className="shrink-0 whitespace-nowrap">
              <StatusChip kind="info">Price rose</StatusChip>
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Last price</p>
            <p className="text-xl font-bold leading-tight text-foreground">{formatPeso(supplier.lastPrice)}</p>
            {priceRose && previousPrice !== null && (
              <p className="text-xs text-muted-foreground">was {formatPeso(previousPrice)}</p>
            )}
          </div>
          {/* The trend, inline. The full chart is still one click away in Advanced. */}
          <div className="shrink-0 pb-1">
            <SparklineCell points={history.map((h) => h.price)} tone={priceRose ? "warning" : "good"} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate-line">{supplier.contact || "No contact saved"}</span>
          </span>
          <Link
            href={`/transactions?supplier=${encodeURIComponent(supplier.name)}`}
            className="shrink-0 font-medium text-primary underline decoration-dotted"
          >
            See spending
          </Link>
        </div>

        {viewMode === "advanced" && <PriceHistoryChart history={history} />}

        {/* Pinned to the bottom so every card's input row lines up across the grid. */}
        <div className="mt-auto flex gap-2 border-t border-border pt-4">
          <Input
            type="number"
            placeholder="New price paid (₱)"
            className="h-9 min-w-0 flex-1 text-sm"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && logNewPrice()}
          />
          <Button size="sm" className="h-9 shrink-0" onClick={logNewPrice}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
