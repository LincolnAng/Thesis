"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, Pencil, Plus, Settings2 } from "lucide-react";
import { ExpensesDetail } from "@/components/summary/expenses-detail";
import { CategoryBudgetEditor } from "@/components/summary/category-budget-editor";
import { QuickEditDialog } from "@/components/home/quick-edit-dialog";
import { StatTile } from "@/components/data-table/stat-tile";
import { Toolbar } from "@/components/data-table/toolbar";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { BigRowList } from "@/components/data-table/big-row-list";
import { SeeAllLink } from "@/components/data-table/see-all-link";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store/use-store";
import { addEntry, deleteEntry, replaceEntry } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { entryToDraft } from "@/lib/home/describe-entry";
import { allExpenseCategories, computeExpensesSummary } from "@/lib/summary/expenses-summary";
import { currentMonthLabel, EXPENSE_CATEGORY_LABELS, formatDate, formatPeso } from "@/lib/format";
import { useViewMode } from "@/lib/summary/view-mode";
import type { Entry } from "@/lib/store/types";

const SIMPLE_ROW_CAP = 8;

export default function ExpensesPage() {
  const { entries, categoryBudgets } = useStore();
  const [viewMode] = useViewMode();
  const summary = useMemo(() => computeExpensesSummary(entries, categoryBudgets), [entries, categoryBudgets]);

  const categoryFilterOptions = useMemo(() => {
    const loggedCategories = entries.filter((e) => e.type === "EXPENSE").map((e) => e.category ?? "misc");
    const categories = Array.from(new Set([...allExpenseCategories(categoryBudgets), ...loggedCategories]));
    return [
      { value: "all", label: "All categories" },
      ...categories.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] ?? c })),
    ];
  }, [categoryBudgets, entries]);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [showBudgetEditor, setShowBudgetEditor] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => e.type === "EXPENSE")
      .filter((e) => categoryFilter === "all" || (e.category ?? "misc") === categoryFilter)
      .filter((e) => !q || e.sku?.toLowerCase().includes(q) || e.rawText?.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [entries, search, categoryFilter]);

  const columns: DataTableColumn<Entry>[] = [
    { key: "date", header: "Date", render: (e) => formatDate(e.timestamp) },
    {
      key: "description",
      header: "Description",
      render: (e) => <p className="font-medium text-foreground">{e.sku ?? e.rawText}</p>,
    },
    {
      key: "category",
      header: "Category",
      render: (e) => EXPENSE_CATEGORY_LABELS[e.category ?? "misc"] ?? e.category ?? "Other",
    },
    { key: "amount", header: "Amount", align: "right", render: (e) => formatPeso(e.amount) },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-foreground">Expenses</h1>
        <p className="text-sm text-muted-foreground">{currentMonthLabel()}</p>
      </div>

      {viewMode === "advanced" && (
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Total spent" value={formatPeso(summary.total)} sub="this month" tone="warning" />
          <StatTile
            label="Budget remaining"
            value={formatPeso(summary.remaining)}
            tone={summary.remaining < 0 ? "critical" : "neutral"}
          />
        </div>
      )}

      <div>
        <Button size="sm" variant="secondary" className="gap-1" onClick={() => setShowBudgetEditor((v) => !v)}>
          <Settings2 className="h-3.5 w-3.5" /> Set budget
        </Button>
      </div>
      {showBudgetEditor && <CategoryBudgetEditor />}

      {viewMode === "advanced" ? (
        <>
          <Toolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by description…"
            filters={[{ label: "Category", value: categoryFilter, options: categoryFilterOptions, onChange: setCategoryFilter }]}
            onAdd={() => setAddOpen(true)}
            addLabel="Add expense"
          />

          <DataTable
            columns={columns}
            rows={filtered}
            keyFor={(e) => e.id}
            emptyMessage="No expenses logged yet."
            renderRowActions={(e) => (
              <div className="flex items-center justify-end gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Edit expense" onClick={() => setEditingEntry(e)}>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
                <ConfirmDeleteButton onConfirm={() => deleteEntry(e.id)} />
              </div>
            )}
          />
        </>
      ) : (
        <>
          <Button size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add expense
          </Button>

          <BigRowList
            rows={filtered.slice(0, SIMPLE_ROW_CAP)}
            keyFor={(e) => e.id}
            icon={ArrowDownRight}
            iconTone="warning"
            title={(e) => e.sku ?? e.rawText}
            subtitle={(e) =>
              `${formatDate(e.timestamp)} · ${EXPENSE_CATEGORY_LABELS[e.category ?? "misc"] ?? e.category ?? "Other"}`
            }
            trailing={(e) => `−${formatPeso(e.amount)}`}
            trailingTone="warning"
            onSelect={(e) => setEditingEntry(e)}
            emptyMessage="No expenses logged yet."
          />

          {filtered.length > 0 && <SeeAllLink label="See all expenses" />}
        </>
      )}

      <ExpensesDetail />

      <QuickEditDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add expense"
        initial={blankEntryDraft("EXPENSE")}
        lockType
        onSave={(draft) => addEntry(draft)}
      />

      {editingEntry && (
        <QuickEditDialog
          open
          onOpenChange={(o) => !o && setEditingEntry(null)}
          title="Edit expense"
          initial={entryToDraft(editingEntry)}
          lockType
          onSave={(draft) => replaceEntry(editingEntry.id, draft)}
        />
      )}
    </div>
  );
}
