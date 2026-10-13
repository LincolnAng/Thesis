"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageTabs } from "@/components/layout/page";
import { ProductsScreen } from "@/components/costing/products-screen";
import { PricingScreen } from "@/components/costing/pricing-screen";
import { ProductGallery } from "@/components/costing/product-gallery";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";

/**
 * Costing: what the shop sells and what it costs to make (Products), and what to charge for it
 * (Pricing). Two views of one set of products, so they live under one tab. Executives only;
 * an employee gets the product gallery.
 */
function CostingPageInner() {
  const me = useCurrentUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  if (!isExecutive(me)) return <ProductGallery />;

  const view = searchParams.get("view") === "pricing" ? "pricing" : "products";
  const subnav = (
    <PageTabs
      tabs={[
        ["products", "Products"],
        ["pricing", "Pricing"],
      ]}
      value={view}
      onChange={(next) => router.replace(next === "pricing" ? `${pathname}?view=pricing` : pathname)}
    />
  );
  return view === "pricing" ? <PricingScreen subnav={subnav} /> : <ProductsScreen subnav={subnav} />;
}

export default function CostingPage() {
  return (
    <Suspense fallback={null}>
      <CostingPageInner />
    </Suspense>
  );
}
