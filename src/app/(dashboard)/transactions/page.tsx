"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Page } from "@/components/layout/page";
import { BudgetBreakdownChart } from "@/components/summary/budget-breakdown-chart";
import { CategoryBudgetEditor } from "@/components/summary/category-budget-editor";
import { QuickEditDialog } from "@/components/home/quick-edit-dialog";
import { MissingProductBanner } from "@/components/sales/missing-product-banner";
import { SettingNumberInput } from "@/components/ui/setting-number-input";
import { useStore } from "@/lib/store/use-store";
import { addEntry, deleteEntry, replaceEntry } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { entryToDraft } from "@/lib/home/describe-entry";
import { computeExpensesSummary } from "@/lib/summary/expenses-summary";
import { salesTarget, setSalesTarget } from "@/lib/summary/business-config";
import { EXPENSE_CATEGORY_LABELS, formatNumber, formatPeso } from "@/lib/format";
import type { Entry } from "@/lib/store/types";

type Kind = "all" | "SALE" | "EXPENSE";

function describe(e: Entry): string {
  return e.sku ?? e.rawText ?? (e.type === "SALE" ? "Sale" : "Expense");
}

/** Month of an entry in local time ("2026-09"), so a sale late on the 30th isn't filed under next month. */
function monthOf(e: Entry): string {
  const d = new Date(e.timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string, style: "long" | "short" = "long") {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", style === "long" ? { month: "long", year: "numeric" } : { month: "short" });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function totals(list: Entry[]) {
  const totalIn = list.filter((e) => e.type === "SALE").reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalOut = list.filter((e) => e.type === "EXPENSE").reduce((s, e) => s + (e.amount ?? 0), 0);
  return { totalIn, totalOut, earned: totalIn - totalOut };
}

function StatCard({
  label,
  value,
  tone,
  icon,
  filled,
  sub,
}: {
  label: string;
  value: number;
  tone: "good" | "bad";
  icon: React.ReactNode;
  /** Solid card with white text, colored by the tone. */
  filled?: boolean;
  sub?: string;
}) {
  const solid = tone === "good" ? "bg-success border-success" : "bg-danger border-danger";
  const iconBg = filled ? "bg-white/20" : tone === "good" ? "bg-success/10" : "bg-danger/10";
  return (
    <div className={`flex items-center gap-3.5 rounded-2xl border px-[22px] py-4 ${filled ? `${solid} text-white` : "border-line/15 bg-white"}`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>{icon}</div>
      <div className="min-w-0">
        <div className={`text-xs font-semibold ${filled ? "text-white/85" : "text-muted-foreground"}`}>{label}</div>
        <div className={`font-display text-[26px] font-bold ${filled ? "text-white" : tone === "good" ? "text-success" : "text-danger"}`}>
          {formatPeso(value)}
        </div>
        {sub && <div className={`text-[11px] font-medium ${filled ? "text-white/85" : "text-muted-foreground"}`}>{sub}</div>}
      </div>
    </div>
  );
}

function TransactionsPageInner() {
  const { entries, categoryBudgets, businessSettings } = useStore();
  const searchParams = useSearchParams();
  // Arriving from a supplier's "See spending" link: show only what was paid to them.
  const supplierFilter = searchParams.get("supplier");

  const [kind, setKind] = useState<Kind>(supplierFilter ? "EXPENSE" : "all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [showBudget, setShowBudget] = useState(false);
  const [editBudgets, setEditBudgets] = useState(false);

  const money = useMemo(() => entries.filter((e) => e.type === "SALE" || e.type === "EXPENSE"), [entries]);
  // Every month with at least one transaction, newest first — always including this one.
  const months = useMemo(() => {
    const now = new Date();
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return [...new Set([current, ...money.map(monthOf)])].sort().reverse();
  }, [money]);
  const [period, setPeriod] = useState<string>(() => months[0]);

  const target = salesTarget(businessSettings);
  const expenses = useMemo(() => computeExpensesSummary(entries, categoryBudgets), [entries, categoryBudgets]);
  const spentByCategory = useMemo(() => new Map(expenses.byCategory.map((row) => [row.category, row.amount])), [expenses]);

  const periodRows = period === "all" ? money : money.filter((e) => monthOf(e) === period);
  const periodTotals = totals(periodRows);
  const allTime = totals(money);
  const periodName = period === "all" ? "all time" : monthLabel(period);
  const monthsInPeriod = period === "all" ? months.length : 1;
  const periodTarget = target * monthsInPeriod;
  const periodBudget = expenses.budget * monthsInPeriod;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return periodRows
      .filter((e) => kind === "all" || e.type === kind)
      .filter((e) => !supplierFilter || (e.counterparty ?? "").toLowerCase() === supplierFilter.toLowerCase())
      .filter((e) => !q || describe(e).toLowerCase().includes(q) || (e.counterparty ?? "").toLowerCase().includes(q))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [periodRows, kind, search, supplierFilter]);

  const grid = "grid-cols-[76px_78px_minmax(0,1.3fr)_96px_minmax(0,1fr)_104px]";

  return (
    <Page
      title="Transactions"
      right={
        <>
          <button
            type="button"
            onClick={() => setShowBudget((v) => !v)}
            className={`rounded-[10px] border px-4 py-2.5 text-[13px] font-semibold ${showBudget ? "border-cacao/30 bg-cacao/10 text-cacao" : "border-line/20 bg-white"}`}
          >
            {showBudget ? "Hide target & budget" : "Target & budget"}
          </button>
          <button type="button" onClick={() => setAddOpen(true)} className="rounded-[10px] bg-cacao px-[18px] py-2.5 text-[13px] font-semibold text-ivory">
            + Add transaction
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <MissingProductBanner sales={entries.filter((e) => e.type === "SALE")} />

        <div className="flex flex-wrap gap-1.5">
          {[...months, "all"].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPeriod(m)}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] ${
                period === m ? "border-cacao bg-cacao font-semibold text-ivory" : "border-line/15 bg-white font-medium text-muted-foreground"
              }`}
            >
              {m === "all" ? "All time" : monthLabel(m)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-3">
          <StatCard
            label={`Money IN · ${periodName}`}
            value={periodTotals.totalIn}
            tone="good"
            sub={periodTarget > 0 ? `${Math.round((periodTotals.totalIn / periodTarget) * 100)}% of ${formatPeso(periodTarget)} target` : "No target set"}
            icon={<ArrowUp className="h-5 w-5 text-success" strokeWidth={2} />}
          />
          <StatCard
            label={`Money OUT · ${periodName}`}
            value={periodTotals.totalOut}
            tone="bad"
            sub={periodBudget > 0 ? `${Math.round((periodTotals.totalOut / periodBudget) * 100)}% of ${formatPeso(periodBudget)} budget` : "No budget set"}
            icon={<ArrowDown className="h-5 w-5 text-danger" strokeWidth={2} />}
          />
          <StatCard
            label={`You EARNED · ${periodName}`}
            value={periodTotals.earned}
            tone={periodTotals.earned >= 0 ? "good" : "bad"}
            filled
            sub={periodTotals.earned >= 0 ? "money in − money out" : "you spent more than you made"}
            icon={<ArrowRight className="h-5 w-5 text-white" strokeWidth={2} />}
          />
        </div>

        {showBudget && (
          <div className="flex flex-col gap-4 rounded-2xl border border-line/15 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold">Target & budget</div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                Monthly sales target ₱
                <SettingNumberInput value={target} onCommit={setSalesTarget} className="h-8 w-28 text-sm" />
              </label>
            </div>
            <BudgetBreakdownChart categoryBudgets={categoryBudgets} spentByCategory={spentByCategory} />
            <button
              type="button"
              onClick={() => setEditBudgets((v) => !v)}
              className="self-start text-xs font-semibold text-cacao"
            >
              {editBudgets ? "Done editing budgets" : "Edit budgets"}
            </button>
            {editBudgets && <CategoryBudgetEditor />}
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-4 min-[1200px]:grid-cols-[1fr_300px]">
          <div className="flex flex-col overflow-hidden rounded-2xl border border-line/15 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/10 px-[18px] py-3.5">
              <div className="text-sm font-semibold">
                Transactions · <span className="font-medium text-muted-foreground">{period === "all" ? "All time" : monthLabel(period)}</span>
              </div>
              <div className="flex gap-1.5">
                {(
                  [
                    ["all", "All"],
                    ["SALE", "Sales"],
                    ["EXPENSE", "Expenses"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`rounded-lg px-3.5 py-1.5 text-[13px] ${kind === k ? "bg-cacao/10 font-semibold text-cacao" : "font-medium text-muted-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[180px] rounded-lg border border-line/20 px-3 py-2 text-[13px] outline-none focus:border-cacao"
              />
            </div>

            {supplierFilter && (
              <div className="flex items-center gap-2 border-b border-line/10 bg-secondary px-[18px] py-2 text-[13px]">
                <span className="text-muted-foreground">Showing payments to</span>
                <span className="font-semibold">{supplierFilter}</span>
                <Link href="/transactions" className="ml-auto font-semibold text-cacao">
                  Clear
                </Link>
              </div>
            )}

            <div className="overflow-x-auto">
              <div className="min-w-[680px]">
                <div className={`grid ${grid} border-b border-line/15 bg-secondary`}>
                  {["Date", "Type", "Item", "Qty", "Customer / Supplier", "Amount"].map((h) => (
                    <div
                      key={h}
                      className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground ${h === "Qty" || h === "Amount" ? "text-right" : ""}`}
                    >
                      {h}
                    </div>
                  ))}
                </div>
                {rows.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">No transactions match.</div>}
                {rows.map((e, i) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEditing(e)}
                    title="Click to edit"
                    className={`grid w-full ${grid} items-center border-b border-line/5 text-left text-[13px] transition hover:bg-[#F0EEE6] ${i % 2 === 0 ? "bg-white" : "bg-ivory"}`}
                  >
                    <div className="px-3 py-2.5 text-muted-foreground">{shortDate(e.timestamp)}</div>
                    <div className="px-3 py-2.5">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${e.type === "SALE" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                        {e.type === "SALE" ? "Sale" : "Expense"}
                      </span>
                    </div>
                    <div className="min-w-0 px-3 py-2.5">
                      <div className={`truncate-line ${e.sku ? "" : "text-muted-foreground"}`}>{describe(e)}</div>
                      {e.type === "EXPENSE" && e.category && (
                        <div className="text-[11px] text-muted-foreground">{EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}</div>
                      )}
                    </div>
                    <div className="px-3 py-2.5 text-right tabular-nums">
                      {e.quantity != null ? (
                        <>
                          <span className="font-semibold">{formatNumber(e.quantity)}</span>
                          {e.unit && <span className="text-muted-foreground"> {e.unit}</span>}
                        </>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </div>
                    <div className="truncate-line px-3 py-2.5">{e.counterparty ?? <span className="text-faint">—</span>}</div>
                    <div className={`px-3 py-2.5 text-right font-semibold ${e.type === "SALE" ? "text-success" : "text-danger"}`}>{formatPeso(e.amount)}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between border-t border-line/10 px-[18px] py-2.5 text-xs text-faint">
              <span>Click a row to edit or delete it</span>
              <span>
                Showing {rows.length} of {periodRows.length} rows
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-line/15 bg-white p-5">
            <div>
              <div className="text-sm font-semibold">All-time summary</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {months.length} month{months.length === 1 ? "" : "s"} · {money.length} transactions
              </div>
            </div>
            <div className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Money in</span>
                <span className="font-semibold text-success">{formatPeso(allTime.totalIn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Money out</span>
                <span className="font-semibold text-danger">{formatPeso(allTime.totalOut)}</span>
              </div>
              <div className="flex justify-between border-t border-line/10 pt-2">
                <span className="font-semibold">You earned</span>
                <span className={`font-bold ${allTime.earned >= 0 ? "text-cacao" : "text-danger"}`}>{formatPeso(allTime.earned)}</span>
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">By month</div>
              <div className="flex flex-col gap-1">
                {months.map((m) => {
                  const t = totals(money.filter((e) => monthOf(e) === m));
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPeriod(m)}
                      className={`grid grid-cols-[40px_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] ${period === m ? "bg-cacao/10" : "hover:bg-secondary"}`}
                    >
                      <span className="font-semibold">{monthLabel(m, "short")}</span>
                      <span className="truncate text-muted-foreground">
                        <span className="text-success">{formatPeso(t.totalIn)}</span> · <span className="text-danger">{formatPeso(t.totalOut)}</span>
                      </span>
                      <span className={`font-bold ${t.earned >= 0 ? "text-cacao" : "text-danger"}`}>{formatPeso(t.earned)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <QuickEditDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add transaction"
        initial={blankEntryDraft(kind === "EXPENSE" ? "EXPENSE" : "SALE")}
        allowedTypes={["SALE", "EXPENSE"]}
        onSave={(draft) => addEntry(draft)}
      />

      {editing && (
        <QuickEditDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          title={editing.type === "SALE" ? "Edit sale" : "Edit expense"}
          initial={entryToDraft(editing)}
          lockType
          onSave={(draft) => replaceEntry(editing.id, draft)}
          onDelete={() => deleteEntry(editing.id)}
        />
      )}
    </Page>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={null}>
      <TransactionsPageInner />
    </Suspense>
  );
}
