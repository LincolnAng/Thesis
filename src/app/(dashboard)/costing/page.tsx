"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageTabs } from "@/components/layout/page";
import { ProductsScreen, type CostingList } from "@/components/costing/products-screen";
import { PricingScreen } from "@/components/costing/pricing-screen";
import { ProductGallery } from "@/components/costing/product-gallery";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";

/**
 * Costing: what the shop sells, what goes into it, and what to charge. Products and the old
 * price calculator are one place now, because a price is only ever worked out from a recipe.
 *
 *   Products       the SKU list — tap one to open its pricing
 *   Pricing        one product's recipe, cost and price (self-set, markup, or target margin)
 *   Raw materials  what goes in, and what it cost
 *   Packaging      what it goes in
 *
 * Every cost is computed live from the recipe and the materials (summary/cost-engine), so a
 * change to a material's price or a recipe shows up in every product and price at once —
 * there is no stored cost to fall out of date. Executives only; employees get the gallery.
 * The view and product live in the URL, so the old /pricing link and the back button work.
 */
type View = "products" | "pricing" | "materials" | "packaging";

const LIST_FOR_VIEW: Record<Exclude<View, "pricing">, CostingList> = {
  products: "products",
  materials: "ingredient",
  packaging: "supply",
};

function readView(raw: string | null): View {
  return raw === "pricing" || raw === "materials" || raw === "packaging" ? raw : "products";
}

function CostingPageInner() {
  const me = useCurrentUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  if (!isExecutive(me)) return <ProductGallery />;

  const view = readView(searchParams.get("view"));
  const productId = searchParams.get("product");
  const go = (next: View, product?: string) => {
    const params = new URLSearchParams();
    if (next !== "products") params.set("view", next);
    if (product) params.set("product", product);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const subnav = (
    <PageTabs
      tabs={[
        ["products", "Products"],
        ["pricing", "Pricing"],
        ["materials", "Raw materials"],
        ["packaging", "Packaging"],
      ]}
      value={view}
      onChange={(next) => go(next, next === "pricing" ? (productId ?? undefined) : undefined)}
    />
  );

  if (view === "pricing") {
    return <PricingScreen subnav={subnav} productId={productId} onSelect={(id) => go("pricing", id)} />;
  }
  return <ProductsScreen subnav={subnav} list={LIST_FOR_VIEW[view]} onOpenPricing={(id) => go("pricing", id)} />;
}

export default function CostingPage() {
  return (
    <Suspense fallback={null}>
      <CostingPageInner />
    </Suspense>
  );
}
