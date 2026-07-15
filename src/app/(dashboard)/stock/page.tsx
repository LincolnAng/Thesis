"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { StockDetail } from "@/components/summary/stock-detail";
import { QuickEditDialog } from "@/components/home/quick-edit-dialog";
import { EditProductDialog } from "@/components/stock/edit-product-dialog";
import { EditRawMaterialDialog } from "@/components/stock/edit-raw-material-dialog";
import { StatTile } from "@/components/data-table/stat-tile";
import { Toolbar } from "@/components/data-table/toolbar";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { BigRowList } from "@/components/data-table/big-row-list";
import { SeeAllLink } from "@/components/data-table/see-all-link";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store/use-store";
import { addEntry } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { currentMonthLabel, formatPeso } from "@/lib/format";
import { useViewMode } from "@/lib/summary/view-mode";
import type { Product, RawMaterialStock } from "@/lib/store/types";

const SIMPLE_ROW_CAP = 8;

export default function StockPage() {
  const { products, rawMaterials } = useStore();
  const [viewMode] = useViewMode();

  const [productSearch, setProductSearch] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterialStock | null>(null);

  const lowStockProductCount = products.filter((p) => p.stockQty <= p.lowStockThreshold).length;
  const lowStockMaterialCount = rawMaterials.filter((m) => m.qty <= m.lowStockThreshold).length;

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    return rawMaterials.filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [rawMaterials, materialSearch]);

  const productColumns: DataTableColumn<Product>[] = [
    { key: "name", header: "Product", render: (p) => <p className="font-medium text-foreground">{p.name}</p> },
    {
      key: "stock",
      header: "Jars on hand",
      align: "right",
      render: (p) => (
        <span className={p.stockQty <= p.lowStockThreshold ? "font-semibold text-[var(--status-warning)]" : ""}>
          {p.stockQty}
        </span>
      ),
    },
    { key: "threshold", header: "Low stock below", align: "right", render: (p) => p.lowStockThreshold },
  ];

  const materialColumns: DataTableColumn<RawMaterialStock>[] = [
    { key: "name", header: "Ingredient", render: (m) => <p className="font-medium text-foreground">{m.name}</p> },
    {
      key: "qty",
      header: "On hand",
      align: "right",
      render: (m) => (
        <span className={m.qty <= m.lowStockThreshold ? "font-semibold text-[var(--status-warning)]" : ""}>
          {m.qty} {m.unit}
        </span>
      ),
    },
    { key: "unitCost", header: "Unit cost", align: "right", render: (m) => formatPeso(m.unitCost) },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-foreground">Stock</h1>
        <p className="text-sm text-muted-foreground">{currentMonthLabel()}</p>
      </div>

      {viewMode === "advanced" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Products" value={String(products.length)} />
          <StatTile
            label="Low stock"
            value={String(lowStockProductCount)}
            tone={lowStockProductCount > 0 ? "warning" : "neutral"}
          />
          <StatTile label="Ingredients" value={String(rawMaterials.length)} />
          <StatTile
            label="Low stock"
            value={String(lowStockMaterialCount)}
            tone={lowStockMaterialCount > 0 ? "warning" : "neutral"}
          />
        </div>
      )}

      <div>
        <Button size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add stock entry
        </Button>
      </div>

      <StockDetail />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Products</h2>
        {viewMode === "advanced" ? (
          <>
            <Toolbar searchValue={productSearch} onSearchChange={setProductSearch} searchPlaceholder="Search products…" />
            <DataTable
              columns={productColumns}
              rows={filteredProducts}
              keyFor={(p) => p.id}
              emptyMessage="No products yet."
              renderRowActions={(p) => (
                <Button size="icon-sm" variant="ghost" aria-label="Edit product" onClick={() => setEditingProduct(p)}>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            />
          </>
        ) : (
          <BigRowList
            rows={products.slice(0, SIMPLE_ROW_CAP)}
            keyFor={(p) => p.id}
            title={(p) => p.name}
            subtitle={(p) => (p.stockQty <= p.lowStockThreshold ? "Running low" : null)}
            trailing={(p) => `${p.stockQty} jars`}
            trailingTone={(p) => (p.stockQty <= p.lowStockThreshold ? "warning" : "neutral")}
            onSelect={(p) => setEditingProduct(p)}
            emptyMessage="No products yet."
          />
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Ingredients</h2>
        {viewMode === "advanced" ? (
          <>
            <Toolbar searchValue={materialSearch} onSearchChange={setMaterialSearch} searchPlaceholder="Search ingredients…" />
            <DataTable
              columns={materialColumns}
              rows={filteredMaterials}
              keyFor={(m) => m.id}
              emptyMessage="No ingredients yet."
              renderRowActions={(m) => (
                <Button size="icon-sm" variant="ghost" aria-label="Edit ingredient" onClick={() => setEditingMaterial(m)}>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            />
          </>
        ) : (
          <BigRowList
            rows={rawMaterials.slice(0, SIMPLE_ROW_CAP)}
            keyFor={(m) => m.id}
            title={(m) => m.name}
            subtitle={(m) => (m.qty <= m.lowStockThreshold ? "Running low" : null)}
            trailing={(m) => `${m.qty} ${m.unit}`}
            trailingTone={(m) => (m.qty <= m.lowStockThreshold ? "warning" : "neutral")}
            onSelect={(m) => setEditingMaterial(m)}
            emptyMessage="No ingredients yet."
          />
        )}
      </div>

      {viewMode === "simple" && (products.length > 0 || rawMaterials.length > 0) && <SeeAllLink label="See all stock" />}

      <QuickEditDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add stock entry"
        initial={blankEntryDraft("INVENTORY_IN")}
        allowedTypes={["INVENTORY_IN", "WASTE", "INVENTORY_OUT"]}
        onSave={(draft) => addEntry(draft)}
      />

      {editingProduct && <EditProductDialog product={editingProduct} onClose={() => setEditingProduct(null)} />}
      {editingMaterial && (
        <EditRawMaterialDialog material={editingMaterial} onClose={() => setEditingMaterial(null)} />
      )}
    </div>
  );
}
