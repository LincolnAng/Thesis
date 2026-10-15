"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageTabs } from "@/components/layout/page";
import { ProductsScreen, type CostingList } from "@/components/costing/products-screen";
import { ProductDetail } from "@/components/costing/product-detail";
import { ProductGallery } from "@/components/costing/product-gallery";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";

/**
 * Costing, organised around products. The Products list is the way in: tap a product and its
 * recipe, cost breakdown and price calculator are all on one page (components/costing/
 * product-detail). Raw materials and Packaging are the inputs every product's cost is worked
 * out from.
 *
 * Executives only; an employee gets the product gallery. The view and product live in the URL,
 * so links from elsewhere (the Calendar, the old /pricing address) open the right product.
 */
type View = "products" | "materials" | "packaging";

const LIST_FOR_VIEW: Record<View, CostingList> = {
  products: "products",
  materials: "ingredient",
  packaging: "supply",
};

function CostingPageInner() {
  const me = useCurrentUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  if (!isExecutive(me)) return <ProductGallery />;

  const raw = searchParams.get("view");
  const view: View = raw === "materials" || raw === "packaging" ? raw : "products";
  // ?view=pricing&product=… is the old price calculator's address; it now means the product.
  const productId = searchParams.get("product");
  const go = (next: View, product?: string) => {
    const params = new URLSearchParams();
    if (next !== "products") params.set("view", next);
    if (product) params.set("product", product);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: true });
  };

  const subnav = (
    <PageTabs
      tabs={[
        ["products", "Products"],
        ["materials", "Raw materials"],
        ["packaging", "Packaging"],
      ]}
      value={productId ? "products" : view}
      onChange={(next) => go(next)}
    />
  );

  if (productId) return <ProductDetail productId={productId} subnav={subnav} onBack={() => go("products")} />;
  return <ProductsScreen subnav={subnav} list={LIST_FOR_VIEW[view]} onOpenPricing={(id) => go("products", id)} />;
}

export default function CostingPage() {
  return (
    <Suspense fallback={null}>
      <CostingPageInner />
    </Suspense>
  );
}
