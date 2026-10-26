"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PageTabs } from "@/components/layout/page";
import { ProductsScreen, type CostingList } from "@/components/costing/products-screen";
import { ProductDetail } from "@/components/costing/product-detail";
import { InventoryScreen } from "@/components/stock/inventory-screen";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";

/**
 * Costing, organised around products. The Products list is the way in: tap a product and its
 * page walks through what goes in, what it costs and what it sells for (components/costing/
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

interface Place {
  view: View;
  productId: string | null;
}

function parse(params: URLSearchParams): Place {
  const raw = params.get("view");
  return {
    view: raw === "materials" || raw === "packaging" ? raw : "products",
    // ?view=pricing&product=… is the old price calculator's address; it now means the product.
    productId: params.get("product"),
  };
}

function CostingPageInner() {
  const me = useCurrentUser();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Which list or product is showing is kept here and written to the address bar, rather than
  // asking the router to navigate. Opening Costing at an address with a query (a refresh on a
  // product, a link from another tab) left the router unable to navigate at all, so every tab
  // and the back link went dead. Links from elsewhere still land on the right place, and the
  // browser's back button still steps through the tabs.
  const key = searchParams.toString();
  const [place, setPlace] = useState<Place>(() => parse(new URLSearchParams(key)));
  // Arriving from a link elsewhere in the app: follow the new address.
  const [seenKey, setSeenKey] = useState(key);
  if (key !== seenKey) {
    setSeenKey(key);
    setPlace(parse(new URLSearchParams(key)));
  }
  useEffect(() => {
    const onPop = () => setPlace(parse(new URLSearchParams(window.location.search)));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Costing is Executives'; anyone else who lands here (an old link) gets Inventory.
  if (!isExecutive(me)) return <InventoryScreen />;

  const { view, productId } = place;
  const go = (next: View, product?: string) => {
    const params = new URLSearchParams();
    if (next !== "products") params.set("view", next);
    if (product) params.set("product", product);
    const query = params.toString();
    setPlace({ view: next, productId: product ?? null });
    window.history.pushState(null, "", query ? `${pathname}?${query}` : pathname);
    window.scrollTo({ top: 0 });
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

  if (productId) {
    return <ProductDetail productId={productId} subnav={subnav} onBack={() => go("products")} onOpenProduct={(id) => go("products", id)} />;
  }
  return <ProductsScreen subnav={subnav} list={LIST_FOR_VIEW[view]} onOpenPricing={(id) => go("products", id)} />;
}

export default function CostingPage() {
  return (
    <Suspense fallback={null}>
      <CostingPageInner />
    </Suspense>
  );
}
