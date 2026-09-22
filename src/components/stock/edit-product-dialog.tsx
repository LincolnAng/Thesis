"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import { addProduct, deleteProduct, renameProduct, updateProduct } from "@/lib/store/store";
import { blankProduct } from "@/lib/store/blank-product";
import { formatPeso, PRICING_MODE_LABELS } from "@/lib/format";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { effectiveProductPrice, productCostPerJar } from "@/lib/summary/recipe-cost";
import type { Product } from "@/lib/store/types";

function nameTaken(name: string, products: Product[], exceptId?: string): boolean {
  const key = name.trim().toLowerCase();
  return products.some((p) => p.id !== exceptId && p.name.trim().toLowerCase() === key);
}

/** Edits save as you type (stock, warning level, price); the name commits on Done, since
 * renaming also rewrites every past entry that refers to the product. */
export function EditProductDialog({
  product,
  products,
  onClose,
}: {
  product: Product;
  products: Product[];
  onClose: () => void;
}) {
  const [name, setName] = useState(product.name);
  const stockField = useNumericDraft(product.stockQty, (n) => updateProduct(product.id, { stockQty: n }));
  const thresholdField = useNumericDraft(product.lowStockThreshold, (n) =>
    updateProduct(product.id, { lowStockThreshold: n }),
  );
  const priceField = useNumericDraft(product.standardPrice, (n) => updateProduct(product.id, { standardPrice: n }));
  const costCtx = useCostContext();
  const effectivePrice = effectiveProductPrice(product, productCostPerJar(product, costCtx));
  const duplicate = nameTaken(name, products, product.id);
  const canClose = name.trim() !== "" && !duplicate;

  function done() {
    if (!canClose) return;
    renameProduct(product.id, name);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && done()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit product</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={name} aria-invalid={!canClose} onChange={(e) => setName(e.target.value)} />
            {duplicate && <p className="text-xs text-destructive">Another product already has this name.</p>}
            {!duplicate && name.trim() !== product.name && name.trim() !== "" && (
              <p className="text-xs text-muted-foreground">Past sales of this product will be renamed too.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Regular price per jar (₱)</Label>
            {product.pricingMode === "manual" ? (
              <Input type="number" value={priceField.value} onChange={(e) => priceField.onChange(e.target.value)} />
            ) : (
              // A calculated price can't be typed over here — it follows the pricing method.
              <p className="text-sm text-foreground">
                <span className="font-semibold">{formatPeso(effectivePrice)}</span>{" "}
                <span className="text-muted-foreground">
                  · {PRICING_MODE_LABELS[product.pricingMode]}, change it on{" "}
                  <Link href="/pricing" className="text-primary underline decoration-dotted">
                    Pricing
                  </Link>
                </span>
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Jars on hand</Label>
              <Input type="number" value={stockField.value} onChange={(e) => stockField.onChange(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Warn when below</Label>
              <Input type="number" value={thresholdField.value} onChange={(e) => thresholdField.onChange(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ConfirmDeleteButton
              label="Delete product"
              onConfirm={() => {
                deleteProduct(product.id);
                onClose();
              }}
            />
            Delete
          </span>
          <Button onClick={done} disabled={!canClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddProductDialog({ products, onClose }: { products: Product[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [threshold, setThreshold] = useState("");
  const duplicate = nameTaken(name, products);
  const valid = name.trim() !== "" && !duplicate;

  function save() {
    if (!valid) return;
    addProduct(
      blankProduct(name, {
        standardPrice: Number(price) || 0,
        stockQty: Number(stock) || 0,
        lowStockThreshold: Number(threshold) || 0,
      }),
    );
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add product</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input
              autoFocus
              placeholder="e.g. Ice Chocolate"
              value={name}
              aria-invalid={duplicate}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            {duplicate && <p className="text-xs text-destructive">A product with this name already exists.</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Regular price per jar (₱)</Label>
            <Input type="number" placeholder="Optional — set it later on Pricing" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Jars on hand</Label>
              <Input type="number" placeholder="0" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Warn when below</Label>
              <Input type="number" placeholder="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid}>
            Add product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
