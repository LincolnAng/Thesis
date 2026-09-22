"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { addEntry } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { pluralize } from "@/lib/format";
import type { Product } from "@/lib/store/types";

/**
 * "I made more jars" — the one inventory entry the owner logs by hand. Just a product and
 * a count; no price or buyer, since neither applies to stock coming in.
 */
export function AddStockDialog({
  products,
  onClose,
  onAddProduct,
}: {
  products: Product[];
  onClose: () => void;
  onAddProduct: () => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [qtyText, setQtyText] = useState("");
  const product = products.find((p) => p.id === productId);
  const qty = Number(qtyText);
  const valid = !!product && qty > 0;

  function save() {
    if (!product || !valid) return;
    addEntry({
      ...blankEntryDraft("INVENTORY_IN", `Added ${pluralize(qty, "jar")} of ${product.name}`),
      sku: product.name,
      quantity: qty,
      unit: "jars",
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add stock</DialogTitle>
        </DialogHeader>

        {products.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Add a product first, then you can add stock to it.</p>
            <Button size="sm" onClick={onAddProduct}>
              Add product
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Product</Label>
              <select
                className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Jars added</Label>
              <Input
                autoFocus
                type="number"
                placeholder="e.g. 40"
                value={qtyText}
                onChange={(e) => setQtyText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
              {product && (
                <p className="text-xs text-muted-foreground">
                  {pluralize(product.stockQty, "jar")} on hand now
                  {qty > 0 && ` → ${pluralize(product.stockQty + qty, "jar")} after this`}
                </p>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="flex-1" disabled={!valid} onClick={save}>
                Save
              </Button>
              <Button size="sm" variant="ghost" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
