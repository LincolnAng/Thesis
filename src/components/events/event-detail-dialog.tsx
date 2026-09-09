"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { borrowStockForEvent, returnStockFromEvent, updateEvent } from "@/lib/store/store";
import { formatNumber, formatPeso } from "@/lib/format";
import type { EventSummary } from "@/lib/summary/events";
import type { Product } from "@/lib/store/types";

/** Parses a quantity field, rejecting anything that isn't a positive number. */
function parseQty(text: string): number | null {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function EventDetailDialog({
  summary,
  products,
  onClose,
}: {
  summary: EventSummary;
  products: Product[];
  onClose: () => void;
}) {
  const { event, holdings } = summary;
  const [borrowProductId, setBorrowProductId] = useState(products[0]?.id ?? "");
  const [borrowQty, setBorrowQty] = useState("");
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});

  const borrowProduct = products.find((p) => p.id === borrowProductId);
  const requested = parseQty(borrowQty);
  // The main pool is the only place borrowed stock can come from, so asking for more than
  // it holds is blocked here rather than silently clamped to whatever is left.
  const tooMuch = requested !== null && borrowProduct != null && requested > borrowProduct.stockQty;

  function doBorrow() {
    if (!borrowProduct || requested === null || tooMuch) return;
    borrowStockForEvent(event.id, borrowProduct.id, requested);
    setBorrowQty("");
  }

  function doReturn(productId: string, onHand: number) {
    const qty = parseQty(returnQty[productId] ?? "");
    if (qty === null || qty > onHand) return;
    returnStockFromEvent(event.id, productId, qty);
    setReturnQty((prev) => ({ ...prev, [productId]: "" }));
  }

  function returnEverything() {
    for (const h of holdings) {
      if (h.onHand > 0) returnStockFromEvent(event.id, h.productId, h.onHand);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl border border-border ring-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-border px-2 py-3">
              <p className="text-xs text-muted-foreground">Still there</p>
              <p className="text-lg font-bold text-foreground">{formatNumber(summary.totalOnHand)}</p>
            </div>
            <div className="rounded-xl border border-border px-2 py-3">
              <p className="text-xs text-muted-foreground">Sold</p>
              <p className="text-lg font-bold text-foreground">{formatNumber(summary.totalSold)}</p>
            </div>
            <div className="rounded-xl border border-border px-2 py-3">
              <p className="text-xs text-muted-foreground">Sales</p>
              <p className="text-lg font-bold text-[var(--status-good)]">{formatPeso(summary.revenue)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Send stock here</h3>
            <p className="text-xs text-muted-foreground">
              This takes the jars out of your main stock so they stop showing as available in the shop.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[10rem] flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Product</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  value={borrowProductId}
                  onChange={(e) => setBorrowProductId(e.target.value)}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatNumber(p.stockQty)} in stock)
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs text-muted-foreground">How many</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  className="h-9"
                  aria-invalid={tooMuch}
                  value={borrowQty}
                  onChange={(e) => setBorrowQty(e.target.value)}
                />
              </div>
              <Button size="sm" className="h-9" disabled={requested === null || tooMuch} onClick={doBorrow}>
                <ArrowUpRight className="mr-1 h-4 w-4" />
                Send
              </Button>
            </div>
            {tooMuch && borrowProduct && (
              <p className="text-xs text-destructive">
                You only have {formatNumber(borrowProduct.stockQty)} of {borrowProduct.name} in main stock.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">What&apos;s there now</h3>
              {summary.totalOnHand > 0 && (
                <Button size="sm" variant="ghost" onClick={returnEverything}>
                  <ArrowDownLeft className="mr-1 h-4 w-4" />
                  Bring everything back
                </Button>
              )}
            </div>
            {holdings.length === 0 ? (
              <p className="rounded-xl border border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing sent here yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {holdings.map((h) => (
                  <li key={h.productId} className="rounded-xl border border-border px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium text-foreground">{h.productName}</p>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{formatNumber(h.onHand)}</span> left
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatNumber(h.borrowed)} sent · {formatNumber(h.sold)} sold
                      {h.lost > 0 && ` · ${formatNumber(h.lost)} lost`}
                      {h.returned > 0 && ` · ${formatNumber(h.returned)} brought back`}
                      {h.revenue > 0 && ` · ${formatPeso(h.revenue)}`}
                    </p>
                    {h.oversold && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-[var(--status-warning)]">
                        <TriangleAlert className="h-3.5 w-3.5" />
                        More was sold here than was ever sent — check the counts.
                      </p>
                    )}
                    {h.onHand > 0 && (
                      <div className="mt-2 flex items-end gap-2">
                        <Input
                          type="number"
                          inputMode="decimal"
                          className="h-8 w-24"
                          placeholder="How many"
                          value={returnQty[h.productId] ?? ""}
                          onChange={(e) => setReturnQty((prev) => ({ ...prev, [h.productId]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8"
                          onClick={() => doReturn(h.productId, h.onHand)}
                        >
                          Bring back
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-4">
            {event.status === "open" ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={summary.totalOnHand > 0}
                onClick={() => updateEvent(event.id, { status: "closed" })}
              >
                Mark finished
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => updateEvent(event.id, { status: "open" })}>
                Reopen
              </Button>
            )}
            <Button size="sm" className="ml-auto" onClick={onClose}>
              Done
            </Button>
          </div>
          {event.status === "open" && summary.totalOnHand > 0 && (
            <p className="-mt-3 text-xs text-muted-foreground">
              Bring the unsold stock back before marking this finished, so it counts as available again.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
