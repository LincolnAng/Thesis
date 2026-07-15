"use client";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import { updateRawMaterial } from "@/lib/store/store";
import type { RawMaterialStock } from "@/lib/store/types";

export function EditRawMaterialDialog({ material, onClose }: { material: RawMaterialStock; onClose: () => void }) {
  const qtyField = useNumericDraft(material.qty, (n) => updateRawMaterial(material.id, { qty: n }));
  const thresholdField = useNumericDraft(material.lowStockThreshold, (n) =>
    updateRawMaterial(material.id, { lowStockThreshold: n }),
  );
  const perBatchField = useNumericDraft(material.perBatchQty ?? 0, (n) =>
    updateRawMaterial(material.id, { perBatchQty: n }),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{material.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">On hand ({material.unit})</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={qtyField.value}
              onChange={(e) => qtyField.onChange(e.target.value)}
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
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Used per batch ({material.unit})</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={perBatchField.value}
              onChange={(e) => perBatchField.onChange(e.target.value)}
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
