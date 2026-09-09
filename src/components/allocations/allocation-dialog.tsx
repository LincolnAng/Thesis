"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { formatNumber } from "@/lib/format";
import { allocationStats } from "@/lib/summary/allocations";
import { useStore } from "@/lib/store/use-store";
import type { Allocation } from "@/lib/store/types";

export function AllocationDialog({
  allocation,
  onClose,
  onSave,
  onDelete,
}: {
  /** null = "create new" mode; otherwise editing this existing allocation. */
  allocation: Allocation | null;
  onClose: () => void;
  onSave: (patch: { productId: string; variantId: string | null; label: string; allocatedQty: number }) => void;
  onDelete?: () => void;
}) {
  const { products, entries } = useStore();
  const [productId, setProductId] = useState(allocation?.productId ?? products[0]?.id ?? "");
  const [variantId, setVariantId] = useState(allocation?.variantId ?? "");
  const [label, setLabel] = useState(allocation?.label ?? "");
  const [qtyText, setQtyText] = useState(allocation ? String(allocation.allocatedQty) : "");

  const product = products.find((p) => p.id === productId);
  const stats = allocation ? allocationStats(allocation, entries) : null;

  function handleSave() {
    const trimmedLabel = label.trim();
    const qty = Number(qtyText) || 0;
    if (!trimmedLabel || !productId || qty <= 0) return;
    onSave({ productId, variantId: variantId || null, label: trimmedLabel, allocatedQty: qty });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{allocation ? allocation.label : "New allocation"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Product</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setVariantId("");
              }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {product && product.variants.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Size</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
              >
                <option value="">Any size</option>
                {product.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label || "Unlabeled size"}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">For (distributor, event, etc.)</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Nomad, IFEX trade show" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Quantity reserved</Label>
            <Input type="number" value={qtyText} onChange={(e) => setQtyText(e.target.value)} placeholder="e.g. 30" />
          </div>

          {allocation && stats && (
            <div className="rounded-xl border border-border p-3 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Reserved</span>
                <span className="font-semibold text-foreground">{formatNumber(allocation.allocatedQty)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Used</span>
                <span className="font-semibold text-foreground">{formatNumber(stats.used)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Remaining</span>
                <span
                  className={
                    stats.remaining <= 0 ? "font-semibold text-[var(--status-warning)]" : "font-semibold text-[var(--status-good)]"
                  }
                >
                  {formatNumber(stats.remaining)}
                </span>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            This reserves stock on paper only — it doesn&apos;t remove anything from the product&apos;s regular stock count.
            Tag a sale/removal against this allocation when logging it (in the entry form) to track what&apos;s been used.
          </p>

          <div className="flex items-center gap-2">
            <Button size="sm" className="flex-1" onClick={handleSave} disabled={!label.trim() || !qtyText}>
              {allocation ? "Save" : "Create allocation"}
            </Button>
            {allocation && onDelete && (
              <ConfirmDeleteButton
                onConfirm={() => {
                  onDelete();
                  onClose();
                }}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
