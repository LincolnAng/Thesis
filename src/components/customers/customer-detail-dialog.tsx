"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber, formatPeso } from "@/lib/format";
import { entriesForCustomer, type DerivedCustomer } from "@/lib/summary/customers";
import { useStore } from "@/lib/store/use-store";

export function CustomerDetailDialog({ customer, onClose }: { customer: DerivedCustomer; onClose: () => void }) {
  const { entries } = useStore();
  const orders = entriesForCustomer(customer.key, entries).slice(0, 10);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{customer.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Orders", value: formatNumber(customer.orderCount) },
              { label: "Total spent", value: formatPeso(customer.totalSpent) },
              {
                label: "Avg order",
                value: formatPeso(customer.orderCount > 0 ? customer.totalSpent / customer.orderCount : 0),
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border p-2.5">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-base font-semibold text-foreground">{stat.value}</p>
              </div>
            ))}
          </div>

          {customer.lastOrderAt && (
            <p className="text-xs text-muted-foreground">
              First bought {customer.firstOrderAt ? formatDate(customer.firstOrderAt) : "—"} · last bought{" "}
              {formatDate(customer.lastOrderAt)}
            </p>
          )}

          {customer.spellings.length > 1 && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Recorded under {customer.spellings.length} spellings — {customer.spellings.join(", ")} — all counted as
              one customer here.
            </p>
          )}

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">What they buy</p>
            <div className="divide-y divide-border rounded-xl border border-border">
              {customer.purchases.map((p) => (
                <div key={p.sku} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-foreground">{p.sku}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(p.quantity)} {p.unit ?? "pcs"} across {p.orders} {p.orders === 1 ? "order" : "orders"}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium text-[var(--status-good)]">{formatPeso(p.spent)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Recent orders</p>
            <div className="divide-y divide-border rounded-xl border border-border">
              {orders.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-foreground">{e.sku ?? "Sale"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(e.timestamp)}</p>
                  </div>
                  <span className="shrink-0 text-muted-foreground">{formatPeso(e.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          <Button size="sm" variant="ghost" className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
