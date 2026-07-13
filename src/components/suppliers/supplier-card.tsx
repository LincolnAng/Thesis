"use client";

import { useState } from "react";
import { Phone, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/format";
import { updateSupplier } from "@/lib/store/store";
import type { Supplier } from "@/lib/store/types";

export function SupplierCard({ supplier }: { supplier: Supplier }) {
  const [newPrice, setNewPrice] = useState("");
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
            <p className="font-semibold text-foreground">{supplier.name}</p>
            <p className="text-xs text-muted-foreground">{supplier.items}</p>
          </div>
          {priceRose && (
            <Badge variant="outline" className="gap-1 border-[var(--status-warning)] text-[var(--status-warning)]">
              <TrendingUp className="h-3 w-3" /> Price rose
            </Badge>
          )}
        </div>

        <p className="text-sm">
          Last price: <span className="font-bold text-foreground">{formatPeso(supplier.lastPrice)}</span>
          {priceRose && previousPrice !== null && (
            <span className="text-muted-foreground"> (was {formatPeso(previousPrice)})</span>
          )}
        </p>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="h-3.5 w-3.5" /> {supplier.contact}
        </div>

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
