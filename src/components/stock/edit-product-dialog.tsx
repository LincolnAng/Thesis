"use client";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import { updateProduct } from "@/lib/store/store";
import type { Product } from "@/lib/store/types";

export function EditProductDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const stockField = useNumericDraft(product.stockQty, (n) => updateProduct(product.id, { stockQty: n }));
  const thresholdField = useNumericDraft(product.lowStockThreshold, (n) =>
    updateProduct(product.id, { lowStockThreshold: n }),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Jars on hand</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={stockField.value}
              onChange={(e) => stockField.onChange(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Low stock warning below</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={thresholdField.value}
              onChange={(e) => thresholdField.onChange(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
