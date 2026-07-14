"use client";

import { useMemo, useState } from "react";
import { Receipt, Wallet, Box, Calculator, Truck, Megaphone, Plus, Settings2 } from "lucide-react";
import { SummaryGrid, type GridItem, type InlineSection } from "@/components/summary/summary-grid";
import { BackLink } from "@/components/summary/back-link";
import { SalesDetail } from "@/components/summary/sales-detail";
import { ExpensesDetail } from "@/components/summary/expenses-detail";
import { StockDetail } from "@/components/summary/stock-detail";
import { CategoryBudgetEditor } from "@/components/summary/category-budget-editor";
import { QuickEditForm } from "@/components/home/quick-edit-form";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store/use-store";
import { addEntry } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { currentMonthLabel, formatPeso } from "@/lib/format";
import { computeSalesSummary } from "@/lib/summary/sales-summary";
import { computeExpensesSummary } from "@/lib/summary/expenses-summary";
import { computeIngredientReach } from "@/lib/summary/ingredient-reach";
import { productCostPerJar } from "@/lib/summary/recipe-cost";
import { summarizeByPlatform } from "@/lib/marketing/social-derive";
import type { EntryType } from "@/lib/store/types";

const TITLES: Record<InlineSection, string> = {
  sales: "Sales",
  expenses: "Expenses",
  stock: "Stock",
};

const ADD_CONFIG: Record<InlineSection, { label: string; initialType: EntryType; allowedTypes?: EntryType[] }> = {
  sales: { label: "Add sale", initialType: "SALE" },
  expenses: { label: "Add expense", initialType: "EXPENSE" },
  stock: { label: "Add stock entry", initialType: "INVENTORY_IN", allowedTypes: ["INVENTORY_IN", "WASTE", "INVENTORY_OUT"] },
};

export default function SummaryPage() {
  const [section, setSection] = useState<InlineSection | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBudgetEditor, setShowBudgetEditor] = useState(false);
  const { entries, products, rawMaterials, suppliers, categoryBudgets, socialStats } = useStore();

  function selectSection(next: InlineSection | null) {
    setShowAddForm(false);
    setShowBudgetEditor(false);
    setSection(next);
  }

  const sales = useMemo(
    () => computeSalesSummary(entries, products, rawMaterials),
    [entries, products, rawMaterials],
  );
  const expenses = useMemo(() => computeExpensesSummary(entries, categoryBudgets), [entries, categoryBudgets]);
  const reaches = useMemo(
    () => computeIngredientReach(rawMaterials, products, entries),
    [rawMaterials, products, entries],
  );

  const mostUrgentReach = reaches
    .filter((r) => r.daysLeft !== null)
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity))[0];
  const stockStat = mostUrgentReach
    ? `${mostUrgentReach.material.name}: ${mostUrgentReach.daysLeft} day${mostUrgentReach.daysLeft === 1 ? "" : "s"} left`
    : "Stock looks good";

  const avgCostPerJar =
    products.length > 0
      ? products.reduce((sum, p) => sum + productCostPerJar(p, rawMaterials).costPerJar, 0) / products.length
      : 0;

  const priceRoseCount = suppliers.filter((s) => {
    const h = s.priceHistory;
    return h.length >= 2 && h[h.length - 1].price > h[h.length - 2].price;
  }).length;

  const totalFollowers = summarizeByPlatform(socialStats).reduce((sum, p) => sum + (p.latest?.followers ?? 0), 0);

  const items: GridItem[] = [
    { key: "sales", label: "Sales", icon: Receipt, stat: `${formatPeso(sales.revenue)} this month` },
    { key: "expenses", label: "Expenses", icon: Wallet, stat: `${formatPeso(expenses.total)} this month` },
    {
      key: "stock",
      label: "Stock",
      icon: Box,
      stat: stockStat,
      statTone: mostUrgentReach && mostUrgentReach.urgency === "red" ? "warning" : "neutral",
    },
    {
      key: "pricing",
      label: "Pricing Calculator",
      icon: Calculator,
      stat: `${formatPeso(avgCostPerJar)} avg cost/jar`,
      href: "/pricing",
    },
    {
      key: "suppliers",
      label: "Suppliers",
      icon: Truck,
      stat:
        priceRoseCount > 0
          ? `${suppliers.length} suppliers · ${priceRoseCount} price rose`
          : `${suppliers.length} suppliers`,
      statTone: priceRoseCount > 0 ? "warning" : "neutral",
      href: "/suppliers",
    },
    {
      key: "marketing",
      label: "Marketing",
      icon: Megaphone,
      stat: `${totalFollowers.toLocaleString("en-PH")} followers`,
      href: "/marketing",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-8">
      {section === null ? (
        <>
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-foreground">Home</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="min-[900px]:hidden">Tap a section to see your numbers</span>
              <span className="hidden min-[900px]:inline">Click a section to see your numbers</span>
            </p>
          </div>
          <SummaryGrid items={items} onSelect={selectSection} />
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-2">
            <BackLink onClick={() => selectSection(null)} />
            <div className="flex items-center gap-2">
              {section === "expenses" && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1"
                  onClick={() => {
                    setShowBudgetEditor((v) => !v);
                    setShowAddForm(false);
                  }}
                >
                  <Settings2 className="h-3.5 w-3.5" /> Set budget
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="gap-1"
                onClick={() => {
                  setShowAddForm((v) => !v);
                  setShowBudgetEditor(false);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> {ADD_CONFIG[section].label}
              </Button>
            </div>
          </div>
          <div className="mb-4 flex items-baseline justify-between">
            <h1 className="text-xl font-bold text-foreground">{TITLES[section]}</h1>
            <p className="text-sm text-muted-foreground">{currentMonthLabel()}</p>
          </div>

          {showBudgetEditor && section === "expenses" && (
            <div className="mb-4">
              <CategoryBudgetEditor />
            </div>
          )}

          {showAddForm && (
            <div className="mb-4">
              <QuickEditForm
                initial={blankEntryDraft(ADD_CONFIG[section].initialType)}
                lockType={!ADD_CONFIG[section].allowedTypes}
                allowedTypes={ADD_CONFIG[section].allowedTypes}
                className="max-w-none"
                onSave={(draft) => {
                  addEntry(draft);
                  setShowAddForm(false);
                }}
                onCancel={() => setShowAddForm(false)}
              />
            </div>
          )}

          {section === "sales" && <SalesDetail />}
          {section === "expenses" && <ExpensesDetail />}
          {section === "stock" && <StockDetail />}
        </>
      )}
    </div>
  );
}
