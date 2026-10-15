"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, CircleDollarSign, HandCoins, Landmark } from "lucide-react";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { CarouselNav } from "@/components/ui/carousel-nav";
import { Page } from "@/components/layout/page";
import { BudgetBreakdownChart } from "@/components/summary/budget-breakdown-chart";
import { CategoryBudgetEditor } from "@/components/summary/category-budget-editor";
import { Bar } from "@/components/summary/bar";
import { MissingProductBanner } from "@/components/sales/missing-product-banner";
import { SettingNumberInput } from "@/components/ui/setting-number-input";
import { QuickEditDialog } from "@/components/home/quick-edit-dialog";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { EMPTY_FILTERS, TransactionSearch, type TransactionFilters } from "@/components/transactions/transaction-search";
import { useStore } from "@/lib/store/use-store";
import { addEntry, deleteEntry, replaceEntry } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { entryToDraft } from "@/lib/home/describe-entry";
import { computeExpensesSummary } from "@/lib/summary/expenses-summary";
import { salesTarget, setSalesTarget } from "@/lib/summary/business-config";
import { carriedOver, dueInfo, monthOf, statusOf, summarize, termOf } from "@/lib/transactions/ledger";
import { formatPeso, pluralize } from "@/lib/format";
import type { Entry, EntryType } from "@/lib/store/types";

/** The static tabs: one per kind of transaction, always on screen. */
type Tab = "all" | "SALE" | "EXPENSE" | "RND" | "WASTE";
const TABS: [Tab, string][] = [
  ["all", "All"],
  ["SALE", "Sales"],
  ["EXPENSE", "Expenses"],
  ["RND", "Investments"],
  ["WASTE", "Spoilage"],
];
const EMPLOYEE_TABS: Tab[] = ["all", "SALE", "WASTE"];
const LEDGER_TYPES = new Set<EntryType>(["SALE", "EXPENSE", "RND", "WASTE"]);

function monthLabel(key: string, style: "long" | "short" = "long") {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", style === "long" ? { month: "long", year: "numeric" } : { month: "short" });
}

/**
 * Transactions: one page, top to bottom — the month's money in boxes, the sales target and
 * budget, then every transaction under tabs, with a search bar that filters as you go.
 *
 * There is no Simple/Advanced split any more: everything is here, in one place. Payables and
 * receivables (money owed either way) are executives' only, as are expenses and investments;
 * employees see sales and spoilage.
 */
function TransactionsPageInner() {
  const { entries, categoryBudgets, businessSettings } = useStore();
  const exec = isExecutive(useCurrentUser());
  const searchParams = useSearchParams();
  // Arriving from a supplier's "See spending" link: show only what was paid to them.
  const supplierFilter = searchParams.get("supplier");

  const [tab, setTab] = useState<Tab>(supplierFilter ? "EXPENSE" : "all");
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [editBudgets, setEditBudgets] = useState(false);
  const now = useMemo(() => new Date(), []);

  const ledger = useMemo(() => entries.filter((e) => LEDGER_TYPES.has(e.type)), [entries]);
  // Every month with at least one transaction, newest first — always including this one.
  const months = useMemo(() => {
    const current = monthOf({ timestamp: now.toISOString() });
    return [...new Set([current, ...ledger.map(monthOf)])].sort().reverse();
  }, [ledger, now]);
  const [period, setPeriod] = useState<string>(() => months[0]);
  const monthIndex = months.indexOf(period);
  const periodName = period === "all" ? "all time" : monthLabel(period);

  const summary = useMemo(() => summarize(ledger, period, now), [ledger, period, now]);
  const carried = useMemo(() => (exec ? carriedOver(ledger, period) : []), [exec, ledger, period]);
  const carriedFrom = useMemo(() => new Map(carried.map((e) => [e.id, monthLabel(monthOf(e), "short")])), [carried]);

  const target = salesTarget(businessSettings);
  const expenses = useMemo(() => computeExpensesSummary(entries, categoryBudgets), [entries, categoryBudgets]);
  const spentByCategory = useMemo(() => new Map(expenses.byCategory.map((row) => [row.category, row.amount])), [expenses]);
  const monthsInPeriod = period === "all" ? months.length : 1;
  const periodTarget = target * monthsInPeriod;
  const periodBudget = expenses.budget * monthsInPeriod;

  const tabs = exec ? TABS : TABS.filter(([t]) => EMPLOYEE_TABS.includes(t));
  const periodRows = useMemo(
    () => (period === "all" ? ledger : ledger.filter((e) => monthOf(e) === period)),
    [ledger, period],
  );

  // What the filter dropdowns offer: only values that actually occur.
  const choices = useMemo(() => {
    const uniq = (list: (string | null | undefined)[]) => [...new Set(list.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    return {
      products: uniq(ledger.map((e) => e.sku)),
      people: uniq(ledger.map((e) => e.counterparty)),
      recorders: uniq(ledger.map((e) => e.loggedByName)),
    };
  }, [ledger]);

  const rows = useMemo(() => {
    const q = filters.text.trim().toLowerCase();
    // Still-owed rows from earlier months come first in a month's Sales, Expenses and All tabs.
    const pool = [...carried, ...periodRows.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp))];
    return pool.filter((e) => {
      if (tab !== "all" && e.type !== tab) return false;
      if (filters.type && e.type !== filters.type) return false;
      if (supplierFilter && (e.counterparty ?? "").toLowerCase() !== supplierFilter.toLowerCase()) return false;
      if (filters.product && e.sku !== filters.product) return false;
      if (filters.person && e.counterparty !== filters.person) return false;
      if (filters.recordedBy && e.loggedByName !== filters.recordedBy) return false;
      if (filters.status) {
        if (filters.status === "spot" && termOf(e) !== "spot") return false;
        if (filters.status === "overdue" && !dueInfo(e, now).overdue) return false;
        if (["pending", "partial", "settled"].includes(filters.status) && statusOf(e) !== filters.status) return false;
      }
      if (q) {
        const hay = [e.sku, e.counterparty, e.rawText, e.notes, e.loggedByName].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [carried, periodRows, tab, filters, supplierFilter, now]);

  const addType: EntryType = tab === "all" ? "SALE" : tab;

  return (
    <Page
      title="Transactions"
      right={
        <button type="button" onClick={() => setAdding(true)} className="rounded-[10px] bg-cacao px-[18px] py-2.5 text-[13px] font-semibold text-ivory">
          + Add transaction
        </button>
      }
    >
      <div className="flex flex-col gap-6">
        <MissingProductBanner sales={entries.filter((e) => e.type === "SALE")} />

        <div className="flex flex-wrap items-center gap-2">
          <CarouselNav
            label={period === "all" ? "All time" : monthLabel(period)}
            onPrev={() => setPeriod(months[monthIndex + 1])}
            onNext={() => setPeriod(months[monthIndex - 1])}
            atStart={period === "all" || monthIndex >= months.length - 1}
            atEnd={period === "all" || monthIndex <= 0}
            prevLabel="Earlier month"
            nextLabel="Later month"
          />
          <button
            type="button"
            onClick={() => setPeriod(period === "all" ? months[0] : "all")}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] ${
              period === "all" ? "border-cacao bg-cacao font-semibold text-ivory" : "border-line/15 bg-card font-medium text-muted-foreground"
            }`}
          >
            All time
          </button>
        </div>

        {/* The money, by kind: cash that moved, what is still owed, and what was earned. */}
        {exec ? (
          <section className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2 min-[1200px]:grid-cols-5" aria-label="Money summary">
            <MoneyBox
              icon={<ArrowDownLeft className="h-5 w-5" />}
              label="Money in"
              value={summary.moneyIn}
              tone="good"
              note={`Cash received · ${periodName}`}
            />
            <MoneyBox
              icon={<ArrowUpRight className="h-5 w-5" />}
              label="Money out"
              value={summary.moneyOut}
              tone="bad"
              note={`Cash paid · ${periodName}`}
            />
            <MoneyBox
              icon={<CircleDollarSign className="h-5 w-5" />}
              label="Money earned"
              value={summary.earned}
              tone={summary.earned >= 0 ? "good" : "bad"}
              filled
              note={summary.spoiled > 0 ? `Sales − expenses − ${formatPeso(summary.spoiled)} spoiled, paid or not` : "Sales − expenses, paid or not"}
            />
            <MoneyBox
              icon={<HandCoins className="h-5 w-5" />}
              label="Receivables"
              value={summary.receivables}
              tone="neutral"
              note={summary.overdueReceivables ? `Owed to us · ${pluralize(summary.overdueReceivables, "overdue")}` : "Owed to us, not yet paid"}
              alert={summary.overdueReceivables > 0}
            />
            <MoneyBox
              icon={<Landmark className="h-5 w-5" />}
              label="Payables"
              value={summary.payables}
              tone="neutral"
              note={summary.overduePayables ? `We owe · ${pluralize(summary.overduePayables, "overdue")}` : "We owe, not yet paid"}
              alert={summary.overduePayables > 0}
            />
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2" aria-label="Sales summary">
            <MoneyBox icon={<ArrowDownLeft className="h-5 w-5" />} label="Sales" value={summary.sales} tone="good" note={`Everything sold · ${periodName}`} />
          </section>
        )}

        {exec && (
          <section className="flex flex-col gap-4 rounded-2xl border border-line/15 bg-card p-5" aria-labelledby="target-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="target-title" className="text-sm font-semibold">
                Sales target & budget · {periodName}
              </h2>
              <button type="button" onClick={() => setEditBudgets((v) => !v)} className="text-xs font-semibold text-cacao">
                {editBudgets ? "Done editing" : "Edit target & budgets"}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-5 min-[800px]:grid-cols-2">
              <Progress
                label="Sales against target"
                value={summary.sales}
                goal={periodTarget}
                empty="No sales target set"
                tone="good"
              />
              <Progress
                label="Expenses against budget"
                value={summary.expenses}
                goal={periodBudget}
                empty="No budget set"
                tone="warning"
              />
            </div>
            {summary.invested > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatPeso(summary.invested)} went into investments {period === "all" ? "overall" : "this month"} — funded by the owners, so not counted above.
              </p>
            )}
            {editBudgets && (
              <div className="flex flex-col gap-4 border-t border-line/10 pt-4">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  Monthly sales target ₱
                  <SettingNumberInput value={target} onCommit={setSalesTarget} className="h-8 w-28 text-sm" />
                </label>
                <BudgetBreakdownChart categoryBudgets={categoryBudgets} spentByCategory={spentByCategory} />
                <CategoryBudgetEditor />
              </div>
            )}
          </section>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="records-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="records-title" className="text-sm font-semibold">
              Transactions · <span className="font-medium text-muted-foreground">{period === "all" ? "All time" : monthLabel(period)}</span>
            </h2>
            <div className="flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-[10px] bg-secondary p-1" role="tablist" aria-label="Kind of transaction">
              {tabs.map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`min-h-10 shrink-0 rounded-lg px-4 py-2 text-[13px] ${tab === t ? "bg-card font-semibold shadow-sm" : "font-medium text-muted-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <TransactionSearch
            value={filters}
            onChange={setFilters}
            products={choices.products}
            people={choices.people}
            recorders={choices.recorders}
            showType={tab === "all"}
            showStatus={exec && (tab === "all" || tab === "SALE" || tab === "EXPENSE")}
          />

          {supplierFilter && (
            <div className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-[13px]">
              <span className="text-muted-foreground">Showing payments to</span>
              <span className="font-semibold">{supplierFilter}</span>
              <Link href="/transactions" className="ml-auto font-semibold text-cacao">
                Clear
              </Link>
            </div>
          )}

          {tab === "RND" && (
            <p className="text-[13px] text-muted-foreground">
              Investments build the business rather than run it — R&D, equipment, repairs, permits and the like. The owners fund
              them, so they are kept out of money in, money out and earnings.
            </p>
          )}

          <div className="overflow-hidden rounded-2xl border border-line/15 bg-card">
            <TransactionTable rows={rows} showPayment={exec} onEdit={setEditing} carriedFrom={carriedFrom} />
            <div className="flex flex-wrap justify-between gap-2 border-t border-line/10 px-4 py-2.5 text-xs text-muted-foreground">
              <span>Press the pencil on a row to change it.</span>
              <span>
                Showing {rows.length} of {periodRows.length + carried.length} rows
                {carried.length > 0 ? ` · ${carried.length} still owed from earlier months` : ""}
              </span>
            </div>
          </div>
        </section>
      </div>

      <QuickEditDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add transaction"
        initial={blankEntryDraft(exec ? addType : addType === "WASTE" ? "WASTE" : "SALE")}
        allowedTypes={exec ? ["SALE", "EXPENSE", "RND", "WASTE"] : ["SALE", "WASTE"]}
        onSave={(draft) => addEntry(draft)}
      />
      {editing && (
        <QuickEditDialog
          key={editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          title="Change transaction"
          initial={entryToDraft(editing)}
          allowedTypes={exec ? ["SALE", "EXPENSE", "RND", "WASTE"] : ["SALE", "WASTE"]}
          onSave={(draft) => replaceEntry(editing.id, draft)}
          onDelete={() => deleteEntry(editing.id)}
        />
      )}
    </Page>
  );
}

function MoneyBox({
  icon,
  label,
  value,
  note,
  tone,
  filled,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
  tone: "good" | "bad" | "neutral";
  filled?: boolean;
  alert?: boolean;
}) {
  const color = tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-foreground";
  if (filled) {
    return (
      <div className={`flex flex-col gap-1 rounded-2xl border px-5 py-4 text-white ${tone === "bad" ? "border-danger bg-danger" : "border-success bg-success"}`}>
        <span className="flex items-center gap-2 text-xs font-semibold text-white/85">
          {icon}
          {label}
        </span>
        <span className="font-display text-[26px] font-bold">{formatPeso(value)}</span>
        <span className="text-[11.5px] text-white/85">{note}</span>
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-1 rounded-2xl border bg-card px-5 py-4 ${alert ? "border-danger/40" : "border-line/15"}`}>
      <span className={`flex items-center gap-2 text-xs font-semibold text-muted-foreground`}>
        <span className={color}>{icon}</span>
        {label}
      </span>
      <span className={`font-display text-[26px] font-bold ${color}`}>{formatPeso(value)}</span>
      <span className={`text-[11.5px] ${alert ? "font-semibold text-danger" : "text-muted-foreground"}`}>{note}</span>
    </div>
  );
}

function Progress({
  label,
  value,
  goal,
  empty,
  tone,
}: {
  label: string;
  value: number;
  goal: number;
  empty: string;
  tone: "good" | "warning";
}) {
  const pct = goal > 0 ? (value / goal) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {goal > 0 ? `${formatPeso(value)} of ${formatPeso(goal)} · ${Math.round(pct)}%` : empty}
        </span>
      </div>
      <Bar pct={Math.min(100, pct)} tone={tone} />
    </div>
  );
}

export default function TransactionsPageSuspended() {
  return (
    <Suspense fallback={null}>
      <TransactionsPageInner />
    </Suspense>
  );
}
