"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusSymbol } from "@/components/ui/status-symbol";
import { formatNumber, formatPeso, pluralize } from "@/lib/format";
import { recordBatch } from "@/lib/store/store";
import { useStore } from "@/lib/store/use-store";
import { useCostContext } from "@/lib/summary/use-cost-context";
import { buildBatchPlan } from "@/lib/summary/batch-plan";

/** Opens the planner for a specific product — used by the low-stock action card. */
export function BatchPlannerButton({ productId }: { productId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Plan a batch
      </Button>
      {open && <BatchPlannerDialog initialProductId={productId} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Checks a production run against every ingredient it needs, not just the one that raised
 * the alarm — including the jars and labels, which is what usually runs out first.
 */
export function BatchPlannerDialog({
  initialProductId,
  onClose,
}: {
  initialProductId?: string;
  onClose: () => void;
}) {
  const { products, rawMaterials } = useStore();
  const ctx = useCostContext();
  const [productId, setProductId] = useState(initialProductId ?? products[0]?.id ?? "");
  const product = products.find((p) => p.id === productId);
  const [jarsText, setJarsText] = useState(String(product?.batchYield || 20));

  const jars = Math.max(0, Number(jarsText) || 0);
  const plan = product ? buildBatchPlan(product, jars, rawMaterials, ctx) : null;

  function handleRecord() {
    if (!plan || jars <= 0) return;
    recordBatch(plan.productId, jars);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-[var(--radius-panel)] border border-border ring-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Plan a batch</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Product</Label>
              <select
                className="h-9 w-full rounded-[var(--radius-control)] border border-input bg-transparent px-2 text-sm"
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
            <div className="w-24 space-y-1">
              <Label className="text-xs text-muted-foreground">How many jars</Label>
              <Input
                type="number"
                inputMode="decimal"
                className="h-9"
                value={jarsText}
                onChange={(e) => setJarsText(e.target.value)}
              />
            </div>
          </div>

          {!plan || plan.requirements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This product has no recipe yet, so there&apos;s nothing to check against. Add its ingredients on the
              Pricing page first.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
                {plan.requirements.map((r) => (
                  <li key={r.materialId} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <StatusSymbol kind={r.enough ? "good" : "critical"} />
                    <span className="min-w-0 flex-1 truncate-line text-foreground">{r.name}</span>
                    <span className="shrink-0 text-right text-muted-foreground">
                      need {formatNumber(r.required)} {r.unit} · have {formatNumber(r.onHand)} {r.unit}
                      {!r.enough && (
                        <span className="block text-[var(--status-critical)]">
                          short {formatNumber(r.short)} {r.unit}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="text-sm text-foreground">
                {plan.feasible ? (
                  <>
                    You can make {pluralize(jars, "jar")}. Estimated cost{" "}
                    <span className="font-semibold">{formatPeso(plan.totalCost)}</span> ({formatPeso(plan.costPerJar)}
                    /jar).
                  </>
                ) : (
                  <>
                    Not enough on hand for {pluralize(jars, "jar")} — you can make{" "}
                    <span className="font-semibold">{pluralize(plan.maxJars, "jar")}</span> with what you have.
                  </>
                )}
              </p>

              <div className="flex items-center gap-2">
                <Button size="sm" className="flex-1" disabled={!plan.feasible || jars <= 0} onClick={handleRecord}>
                  Record this batch
                </Button>
                {!plan.feasible && plan.maxJars > 0 && (
                  <Button size="sm" variant="secondary" onClick={() => setJarsText(String(plan.maxJars))}>
                    Make {plan.maxJars} instead
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Recording adds the jars to stock and takes the ingredients off.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
