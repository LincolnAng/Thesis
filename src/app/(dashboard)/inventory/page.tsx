"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { StockDetail } from "@/components/summary/stock-detail";
import { QuickEditDialog } from "@/components/home/quick-edit-dialog";
import { EditProductDialog } from "@/components/stock/edit-product-dialog";
import { EditRawMaterialDialog } from "@/components/stock/edit-raw-material-dialog";
import { DemandForecastCard } from "@/components/inventory/demand-forecast-card";
import { Toolbar } from "@/components/data-table/toolbar";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { BigRowList } from "@/components/data-table/big-row-list";
import { SeeAllLink } from "@/components/data-table/see-all-link";
import { StockLevelBar, stockLevel } from "@/components/data-table/stock-level";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store/use-store";
import { addEntry } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { currentMonthLabel } from "@/lib/format";
import { iconForItemName, ItemIcon } from "@/lib/summary/item-icons";
import { forecastAll, nextMonthLabel } from "@/lib/summary/forecast";
import { useViewMode } from "@/lib/summary/view-mode";
import type { Product, RawMaterialStock } from "@/lib/store/types";

const SIMPLE_ROW_CAP = 8;

/** Icon + name in one cell, so a row reads as a thing rather than as a line of text. */
function ItemCell({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
        <ItemIcon name={name} className="h-3.5 w-3.5 text-secondary-foreground" />
      </span>
      <span className="font-medium text-foreground">{name}</span>
    </span>
  );
}

export default function InventoryPage() {
  const { products, rawMaterials, entries } = useStore();
  const [viewMode] = useViewMode();

  const [productSearch, setProductSearch] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterialStock | null>(null);

  const forecasts = useMemo(() => forecastAll(products, entries), [products, entries]);
  const lowProducts = products.filter((p) => stockLevel(p.stockQty, p.lowStockThreshold) === "low").length;
  const lowMaterials = rawMaterials.filter((m) => stockLevel(m.qty, m.lowStockThreshold) === "low").length;

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    return rawMaterials.filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [rawMaterials, materialSearch]);

  const productColumns: DataTableColumn<Product>[] = [
    { key: "name", header: "Product", render: (p) => <ItemCell name={p.name} /> },
    {
      key: "level",
      header: "Level",
      render: (p) => <StockLevelBar level={stockLevel(p.stockQty, p.lowStockThreshold)} />,
    },
    {
      key: "stock",
      header: "On hand",
      align: "right",
      render: (p) => (
        <span
          className={cnLevel(stockLevel(p.stockQty, p.lowStockThreshold))}
        >
          {p.stockQty} jars
        </span>
      ),
    },
  ];

  const materialColumns: DataTableColumn<RawMaterialStock>[] = [
    { key: "name", header: "Ingredient", render: (m) => <ItemCell name={m.name} /> },
    { key: "level", header: "Level", render: (m) => <StockLevelBar level={stockLevel(m.qty, m.lowStockThreshold)} /> },
    {
      key: "qty",
      header: "On hand",
      align: "right",
      render: (m) => (
        <span className={cnLevel(stockLevel(m.qty, m.lowStockThreshold))}>
          {m.qty} {m.unit}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-foreground">Inventory</h1>
        <p className="text-sm text-muted-foreground">{currentMonthLabel()}</p>
      </div>

      <DemandForecastCard
        forecasts={forecasts}
        monthLabel={nextMonthLabel()}
        compact={viewMode === "simple"}
      />

      <div>
        <Button size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add inventory entry
        </Button>
      </div>

      <StockDetail />

      <div className="space-y-3">
        <SectionHeading label="Products" lowCount={lowProducts} />
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
            iconFor={(p) => iconForItemName(p.name)}
            iconTone={(p) => (stockLevel(p.stockQty, p.lowStockThreshold) === "low" ? "warning" : "good")}
            title={(p) => p.name}
            subtitle={(p) => <StockLevelBar level={stockLevel(p.stockQty, p.lowStockThreshold)} />}
            trailing={(p) => `${p.stockQty} jars`}
            trailingTone={(p) => (stockLevel(p.stockQty, p.lowStockThreshold) === "low" ? "warning" : "neutral")}
            onSelect={(p) => setEditingProduct(p)}
            emptyMessage="No products yet."
          />
        )}
      </div>

      <div className="space-y-3">
        <SectionHeading label="Ingredients" lowCount={lowMaterials} />
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
            iconFor={(m) => iconForItemName(m.name)}
            iconTone={(m) => (stockLevel(m.qty, m.lowStockThreshold) === "low" ? "warning" : "good")}
            title={(m) => m.name}
            subtitle={(m) => <StockLevelBar level={stockLevel(m.qty, m.lowStockThreshold)} />}
            trailing={(m) => `${m.qty} ${m.unit}`}
            trailingTone={(m) => (stockLevel(m.qty, m.lowStockThreshold) === "low" ? "warning" : "neutral")}
            onSelect={(m) => setEditingMaterial(m)}
            emptyMessage="No ingredients yet."
          />
        )}
      </div>

      {viewMode === "simple" && (products.length > 0 || rawMaterials.length > 0) && (
        <SeeAllLink label="See all inventory" />
      )}

      <QuickEditDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add inventory entry"
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

/** The low-stock count lives in the heading rather than in its own stat tile — one number
 * next to the thing it describes, instead of two tiles both labelled "Low stock". */
function SectionHeading({ label, lowCount }: { label: string; lowCount: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{label}</h2>
      {lowCount > 0 && (
        <span className="text-xs font-medium text-[var(--status-warning)]">{lowCount} running low</span>
      )}
    </div>
  );
}

function cnLevel(level: ReturnType<typeof stockLevel>): string {
  return level === "low" ? "font-semibold text-[var(--status-warning)]" : "text-foreground";
}
