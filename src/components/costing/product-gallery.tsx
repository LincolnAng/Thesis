"use client";

import { Package } from "lucide-react";
import { Page } from "@/components/layout/page";
import { useStore } from "@/lib/store/use-store";
import { useProductPhotos } from "@/lib/products/photos";
import { profileColor } from "@/lib/auth/profile-colors";
import { fullName } from "@/lib/summary/product-sizes";
import { productExpiry } from "@/lib/summary/product-lots";
import { expiringWithinDays, shelfLifeDays } from "@/lib/summary/business-config";
import { pluralize } from "@/lib/format";
import type { Product } from "@/lib/store/types";

/**
 * Inventory, as an employee sees it (the executive's Costing tab): every product and how many
 * are on the shelf right now, with what's running low or about to expire. Quantities come from
 * the same stock every sale, batch and spoilage moves — record those on Transactions or
 * Production and the numbers here follow. Nothing about cost: the server never sends an
 * employee costs (lib/auth/permissions).
 */

type Status = "out" | "low" | "ok";

function statusOf(p: Product): Status {
  if (p.stockQty <= 0) return "out";
  if (p.lowStockThreshold > 0 && p.stockQty <= p.lowStockThreshold) return "low";
  return "ok";
}

const STATUS: Record<Status, { label: string; className: string }> = {
  out: { label: "Out of stock", className: "bg-danger/10 text-danger" },
  low: { label: "Running low", className: "bg-[var(--status-warning)]/10 text-[var(--status-warning)]" },
  ok: { label: "In stock", className: "bg-success/10 text-success" },
};

export function ProductGallery() {
  const { products, entries, businessSettings } = useStore();
  const photos = useProductPhotos();
  const window = expiringWithinDays(businessSettings);

  const rows = products
    .map((p, i) => {
      const expiry = productExpiry(entries, p, shelfLifeDays(businessSettings, p.id), window, new Date(), products);
      return { p, i, name: fullName(p, products), status: statusOf(p), expiring: expiry.expiring, expired: expiry.expired };
    })
    // What needs attention first: out, then low, then the rest by name.
    .sort((a, b) => ({ out: 0, low: 1, ok: 2 })[a.status] - ({ out: 0, low: 1, ok: 2 })[b.status] || a.name.localeCompare(b.name));

  const low = rows.filter((r) => r.status !== "ok").length;

  return (
    <Page title="Inventory" hideModeToggle>
      {products.length === 0 ? (
        <div className="rounded-2xl border border-line/15 bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No products yet. An Executive adds them.
        </div>
      ) : (
        <div className="flex max-w-[900px] flex-col gap-3">
          <p className="text-[14px] text-muted-foreground">
            {pluralize(products.length, "product")} · {low > 0 ? <span className="font-semibold text-danger">{low} need restocking</span> : "everything is in stock"}
          </p>
          <ul className="flex flex-col divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/15 bg-card">
            {rows.map(({ p, i, name, status, expiring, expired }) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                  {photos[p.id] ? (
                    // A data URL from the owner's own upload; next/image can't optimise these.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photos[p.id]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center" style={{ background: profileColor(undefined, i) }}>
                      <Package className="h-6 w-6 text-ivory" strokeWidth={1.5} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{name}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS[status].className}`}>{STATUS[status].label}</span>
                    {p.lowStockThreshold > 0 && <span className="text-muted-foreground">restock at {p.lowStockThreshold}</span>}
                    {expired > 0 && <span className="font-semibold text-danger">{expired} past their date</span>}
                    {expiring > 0 && <span className="font-semibold text-[var(--status-warning)]">{expiring} expiring soon</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-[22px] font-bold tabular-nums leading-none ${status === "ok" ? "" : status === "low" ? "text-[var(--status-warning)]" : "text-danger"}`}>
                    {p.stockQty}
                  </div>
                  <div className="text-[12px] text-muted-foreground">{p.unit || "jars"} on hand</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] text-muted-foreground">
            Counts change as sales, batches and spoilage are recorded — on Transactions and Production.
          </p>
        </div>
      )}
    </Page>
  );
}
