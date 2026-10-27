"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, CircleDollarSign, PackageX } from "lucide-react";
import { isMaterialWaste } from "@/lib/transactions/waste";
import { findProduct } from "@/lib/summary/product-match";
import { fullName } from "@/lib/summary/product-sizes";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { CarouselNav } from "@/components/ui/carousel-nav";
import { Page } from "@/components/layout/page";
import { BUTTON, toggleButton } from "@/components/ui/kit";
import { BudgetBreakdownChart } from "@/components/summary/budget-breakdown-chart";
import { CategoryBudgetEditor } from "@/components/summary/category-budget-editor";
import { Bar } from "@/components/summary/bar";
import { MissingProductBanner } from "@/components/sales/missing-product-banner";
import { SettingNumberInput } from "@/components/ui/setting-number-input";
import { QuickEditDialog } from "@/components/home/quick-edit-dialog";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { TransactionDialog } from "@/components/transactions/transaction-dialog";
import { EMPTY_FILTERS, TransactionSearch, type TransactionFilters } from "@/components/transactions/transaction-search";
import { DefaultDialog, DueDateDialog } from "@/components/transactions/obligation-dialogs";
import { useStore } from "@/lib/store/use-store";
import { addEntry, deleteEntry, replaceEntry } from "@/lib/store/store";
import { entryToDraft } from "@/lib/home/describe-entry";
import { computeExpensesSummary } from "@/lib/summary/expenses-summary";
import { salesTarget, setSalesTarget } from "@/lib/summary/business-config";
import {
  canBeOwed,
  cashMovements,
  currentDueDate,
  dayOf,
  isAnyInvestment,
  methodOf,
  monthOf,
  obligationInfo,
  obligationKind,
  obligations,
  outstanding,
  summarize,
  type ObligationRow,
} from "@/lib/transactions/ledger";
import { EXPENSE_CATEGORY_LABELS, formatPeso, pluralize } from "@/lib/format";
import type { Entry, EntryType } from "@/lib/store/types";

/** Which kinds of transaction the list shows. One list, never split by direction. */
type Kind = "all" | "SALE" | "EXPENSE" | "RECEIVABLE" | "PAYABLE" | "INVEST" | "WASTE" | "MATERIAL_WASTE";
const KINDS: [Kind, string][] = [
  ["all", "All"],
  ["SALE", "Sales"],
  ["EXPENSE", "Expenses"],
  ["RECEIVABLE", "Accounts receivable"],
  ["PAYABLE", "Accounts payable"],
  ["INVEST", "Investments"],
  ["WASTE", "Spoilage"],
  ["MATERIAL_WASTE", "Waste"],
];
// Employees see sales, everyday expenses, spoilage and waste — never what is owed or invested.
const EMPLOYEE_KINDS: Kind[] = ["all", "SALE", "EXPENSE", "WASTE", "MATERIAL_WASTE"];
const LEDGER_TYPES = new Set<EntryType>(["SALE", "EXPENSE", "RND", "CAPITAL", "ASSET", "WASTE"]);
const byNewest = (a: Entry, b: Entry) => b.timestamp.localeCompare(a.timestamp);

function monthLabel(key: string, style: "long" | "short" = "long") {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", style === "long" ? { month: "long", year: "numeric" } : { month: "short" });
}

/**
 * Transactions: the month's money in boxes, the sales target and budget, then one list of every
 * transaction with filters for its kind and a search bar.
 *
 * The boxes keep what has actually changed hands apart from what is still owed (receivables and
 * payables). Nothing owed is ever counted as money in or out; only a payment recorded against it
 * is, on the day it was made. Each owed row has its payment, default and due-date actions in the
 * list itself. Executives handle those; employees see sales, everyday expenses and spoilage.
 */
function TransactionsPageInner() {
  const { entries, categoryBudgets, businessSettings, products } = useStore();
  const exec = isExecutive(useCurrentUser());
  const searchParams = useSearchParams();
  // Arriving from a supplier's "See spending" link: show only what was paid to them.
  const supplierFilter = searchParams.get("supplier");

  const [kind, setKind] = useState<Kind>(supplierFilter ? "EXPENSE" : "all");
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [defaulting, setDefaulting] = useState<ObligationRow | null>(null);
  const [movingDue, setMovingDue] = useState<ObligationRow | null>(null);
  const [editBudgets, setEditBudgets] = useState(false);
  const [notice, setNotice] = useState<{ tone: "wait" | "good" | "bad"; text: string; undo?: () => Promise<string> } | null>(null);
  const now = useMemo(() => new Date(), []);

  const ledger = useMemo(() => entries.filter((e) => LEDGER_TYPES.has(e.type)), [entries]);
  // Every month with a transaction or a payment, newest first — always including this one.
  const months = useMemo(() => {
    const current = monthOf({ timestamp: now.toISOString() });
    const paid = cashMovements(ledger).map((m) => m.date.slice(0, 7));
    return [...new Set([current, ...ledger.map(monthOf), ...paid])].sort().reverse();
  }, [ledger, now]);
  const [period, setPeriod] = useState<string>(() => months[0]);
  const monthIndex = months.indexOf(period);
  const periodName = period === "all" ? "all time" : monthLabel(period);

  const summary = useMemo(() => summarize(ledger, period, now), [ledger, period, now]);

  const target = salesTarget(businessSettings);
  const expenses = useMemo(() => computeExpensesSummary(entries, categoryBudgets), [entries, categoryBudgets]);
  const spentByCategory = useMemo(() => new Map(expenses.byCategory.map((row) => [row.category, row.amount])), [expenses]);
  const monthsInPeriod = period === "all" ? months.length : 1;
  const periodTarget = target * monthsInPeriod;
  const periodBudget = expenses.budget * monthsInPeriod;

  // Which product a sale or spoilage line is, by id — whatever it was called at the time.
  const productIdOf = (id: string | null, name: string | null) => (id && products.some((p) => p.id === id) ? id : (findProduct(products, name)?.id ?? null));
  const productIdsIn = (e: Entry): string[] =>
    e.type === "SALE" || (e.type === "WASTE" && !isMaterialWaste(e))
      ? (e.lineItems?.length ? e.lineItems.map((l) => productIdOf(l.productId, l.name)) : [productIdOf(null, e.sku)]).filter((x): x is string => !!x)
      : [];

  // What the filter dropdowns offer: each lists only its own kind of thing.
  const choices = useMemo(() => {
    const uniq = (list: (string | null | undefined)[]) => [...new Set(list.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    return {
      // The products, named as Inventory names them.
      products: products.map((p): [string, string] => [p.id, fullName(p, products)]).sort((a, b) => a[1].localeCompare(b[1])),
      customers: uniq(ledger.filter((e) => e.type === "SALE").map((e) => e.counterparty)),
      suppliers: uniq(ledger.filter((e) => e.type === "EXPENSE" || e.type === "ASSET").map((e) => e.counterparty)),
      recorders: uniq(ledger.map((e) => e.loggedByName)),
      banks: uniq(ledger.map((e) => methodOf(e).bank)),
      categories: uniq(ledger.filter((e) => e.type === "EXPENSE").map((e) => e.category)).map((c): [string, string] => [c, EXPENSE_CATEGORY_LABELS[c] ?? c]),
    };
  }, [ledger, products]);

  // The search bar and filters, applied to a transaction (or to the one a payment was made on).
  const matches = (e: Entry) => {
    if (supplierFilter && (e.counterparty ?? "").toLowerCase() !== supplierFilter.toLowerCase()) return false;
    if (filters.product && !productIdsIn(e).includes(filters.product)) return false;
    if (filters.customer && !(e.type === "SALE" && e.counterparty === filters.customer)) return false;
    if (filters.supplier && !((e.type === "EXPENSE" || e.type === "ASSET") && e.counterparty === filters.supplier)) return false;
    if (filters.recordedBy && e.loggedByName !== filters.recordedBy) return false;
    if (filters.priceType && !(e.type === "SALE" && (e.priceType ?? "standard") === filters.priceType)) return false;
    if (filters.category && e.category !== filters.category) return false;
    // Payment characteristics. Spoilage and older owner-funded investments have none to match.
    if (filters.status || filters.method || filters.bank) {
      if (e.type !== "SALE" && e.type !== "EXPENSE" && e.type !== "ASSET" && e.type !== "CAPITAL") return false;
      if (filters.method || filters.bank) {
        const how = methodOf(e);
        if (filters.method && how.method !== filters.method) return false;
        if (filters.bank && how.bank !== filters.bank) return false;
      }
      if (filters.status) {
        const owed = obligationKind(e) !== null;
        const info = owed ? obligationInfo(e, now) : null;
        const ok =
          filters.status === "spot"
            ? !owed
            : !info
              ? false
              : filters.status === "pending"
                ? info.status !== "settled" && !info.partlyPaid
                : filters.status === "partial"
                  ? info.partlyPaid
                  : filters.status === "settled"
                    ? info.status === "settled"
                    : info.status === filters.status; // overdue, defaulted
        if (!ok) return false;
      }
    }
    const day = dayOf(e.timestamp);
    if (filters.dateFrom && day < filters.dateFrom) return false;
    if (filters.dateTo && day > filters.dateTo) return false;
    const amount = e.amount ?? 0;
    if (filters.minAmount && amount < Number(filters.minAmount)) return false;
    if (filters.maxAmount && amount > Number(filters.maxAmount)) return false;
    const q = filters.text.trim().toLowerCase();
    if (q) {
      const hay = [e.sku, e.counterparty, e.rawText, e.notes, e.loggedByName, e.bankName].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  const kinds = exec ? KINDS : KINDS.filter(([k]) => EMPLOYEE_KINDS.includes(k));
  const effectiveKind: Kind = kinds.some(([k]) => k === kind) ? kind : "all";
  // How many receivables or payables still have something owed, for the tab's badge.
  const openCount = (k: "RECEIVABLE" | "PAYABLE") =>
    ledger.filter((e) => obligationKind(e) === (k === "RECEIVABLE" ? "receivable" : "payable") && outstanding(e) > 0).length;
  const inKind = (e: Entry) => {
    switch (effectiveKind) {
      case "all":
        return true;
      case "RECEIVABLE":
        return obligationKind(e) === "receivable";
      case "PAYABLE":
        return obligationKind(e) === "payable";
      case "INVEST":
        return isAnyInvestment(e);
      case "WASTE":
        return e.type === "WASTE" && !isMaterialWaste(e);
      case "MATERIAL_WASTE":
        return isMaterialWaste(e);
      default:
        return e.type === effectiveKind;
    }
  };

  // The list: what was made in the period, plus — for executives — earlier receivables and
  // payables still unpaid or paid during it, so a debt isn't forgotten when the calendar turns.
  const rangeOn = Boolean(filters.dateFrom || filters.dateTo);
  const madeIn = (e: Entry) => rangeOn || period === "all" || monthOf(e) === period;
  const earlierRows = exec && period !== "all" && !rangeOn
    ? ledger.filter(
        (e) =>
          monthOf(e) < period &&
          canBeOwed(e) &&
          (outstanding(e) > 0 || (e.payments ?? []).some((p) => p.date.slice(0, 7) === period)),
      )
    : [];
  const carriedFrom = new Map(earlierRows.filter((e) => matches(e) && inKind(e)).map((e) => [e.id, monthLabel(monthOf(e), "short")]));
  const tracker = effectiveKind === "RECEIVABLE" || effectiveKind === "PAYABLE";
  const rows = tracker
    ? // The tracker reads by urgency: what is still unpaid first, soonest deadline first.
      [...earlierRows.filter((e) => carriedFrom.has(e.id)), ...ledger.filter((e) => madeIn(e) && matches(e) && inKind(e))].sort(
        (a, b) =>
          Number(outstanding(b) > 0) - Number(outstanding(a) > 0) ||
          (currentDueDate(a) ?? "9999").localeCompare(currentDueDate(b) ?? "9999") ||
          byNewest(a, b),
      )
    : [
        ...earlierRows.filter((e) => carriedFrom.has(e.id)).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        ...ledger.filter((e) => madeIn(e) && matches(e) && inKind(e)).sort(byNewest),
      ];

  // The obligation behind a row, for the payment, default and due-date dialogs.
  const rowFor = (e: Entry): ObligationRow | null => {
    const k = obligationKind(e);
    return k ? obligations([e], k, now)[0] : null;
  };

  return (
    <Page title="Transactions">
      <div className="flex flex-col gap-6">
        <MissingProductBanner sales={entries.filter((e) => e.type === "SALE")} />

        <div className="flex flex-wrap items-center gap-2">
          <CarouselNav
            label={period === "all" ? "All time" : monthLabel(period)}
            labelWidth="w-[150px]"
            position={period === "all" || monthIndex < 0 ? undefined : { index: months.length - 1 - monthIndex, count: months.length }}
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
            className={toggleButton(period === "all")}
          >
            All time
          </button>
        </div>

        {/* Three cards. Cash that actually moved sits beside what is still owed, each in its own
            labelled figure — never added together — and the third is earnings, as before. */}
        {exec ? (
          <section className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2 min-[1300px]:grid-cols-[1.25fr_1.25fr_0.8fr_0.7fr]" aria-label="Money summary">
            <SplitCard
              icon={<ArrowDownLeft className="h-4 w-4" />}
              title="Money in & receivables"
              tone="good"
              main={{
                label: "Money received",
                value: summary.moneyIn,
                note: summary.capitalIn > 0 ? `Includes ${formatPeso(summary.capitalIn)} capital put in` : "Cash that came in",
              }}
              owed={{
                label: "Receivables",
                value: summary.receivables,
                note: summary.overdueReceivables
                  ? `${pluralize(summary.overdueReceivables, "payment")} overdue`
                  : "Not money in until paid",
                alert: summary.overdueReceivables > 0,
              }}
            />
            <SplitCard
              icon={<ArrowUpRight className="h-4 w-4" />}
              title="Money out & payables"
              tone="bad"
              main={{
                label: "Money paid",
                value: summary.moneyOut,
                note: summary.assetsOut > 0 ? `Includes ${formatPeso(summary.assetsOut)} in long-term assets` : "Cash that went out",
              }}
              owed={{
                label: "Payables",
                value: summary.payables,
                note: summary.overduePayables
                  ? `${pluralize(summary.overduePayables, "payment")} overdue`
                  : "Not money out until paid",
                alert: summary.overduePayables > 0,
              }}
            />
            <MoneyBox
              icon={<CircleDollarSign className="h-5 w-5" />}
              heading={period === "all" ? "All time" : monthLabel(period)}
              label="Money earned"
              value={summary.earned}
              tone={summary.earned >= 0 ? "good" : "bad"}
              filled
              note={summary.spoiled > 0 ? `Sales − expenses − ${formatPeso(summary.spoiled)} spoiled` : "Sales − expenses"}
            />
            <MoneyBox
              icon={<PackageX className="h-5 w-5" />}
              label="Spoilage & waste"
              value={summary.spoiled + summary.wasted}
              tone={summary.spoiled + summary.wasted > 0 ? "bad" : "neutral"}
              note={`${formatPeso(summary.spoiled)} products spoiled · ${formatPeso(summary.wasted)} materials wasted · ${periodName}`}
            />
          </section>
        ) : null /* Employees see no totals: what the company earns and spends stays with Executives. */}

        {exec && (
          <section className="flex flex-col gap-3 rounded-2xl border border-line/15 bg-card px-4 py-3" aria-labelledby="target-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="target-title" className="font-display text-[17px] font-semibold">
                Sales target & budget · {periodName}
              </h2>
              <button type="button" onClick={() => setEditBudgets((v) => !v)} className="min-h-8 text-[12.5px] font-semibold text-cacao">
                {editBudgets ? "Done editing" : "Edit target & budgets"}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 min-[800px]:grid-cols-2 min-[800px]:gap-8">
              <Progress label="Sales against target" value={summary.sales} goal={periodTarget} empty="No sales target set" tone="good" />
              <Progress label="Expenses against budget" value={summary.expenses} goal={periodBudget} empty="No budget set" tone="warning" />
            </div>
            {(summary.assetsBought > 0 || summary.capitalIn > 0 || summary.invested > 0) && (
              <p className="text-xs text-muted-foreground">
                Investments aren&apos;t counted against the target or budget:{" "}
                {[
                  summary.capitalIn > 0 && `${formatPeso(summary.capitalIn)} capital put in`,
                  summary.assetsBought > 0 && `${formatPeso(summary.assetsBought)} in long-term assets`,
                  summary.invested > 0 && `${formatPeso(summary.invested)} in older owner-funded investments`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                .
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

        {/* One list: filter by kind, with the add button beside it. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Every kind as its own tab, so Receivables and Payables are always in sight. */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Kind of transaction">
            {kinds.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={effectiveKind === k}
                onClick={() => setKind(k)}
                className={`min-h-10 rounded-full border px-4 text-[13.5px] font-semibold transition ${
                  effectiveKind === k ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card text-foreground hover:border-cacao/50"
                }`}
              >
                {label}
                {(k === "RECEIVABLE" || k === "PAYABLE") && openCount(k) > 0 && (
                  <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${effectiveKind === k ? "bg-ivory/25" : "bg-[var(--status-warning)]/15 text-[var(--status-warning)]"}`}>{openCount(k)}</span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={BUTTON.primary}
          >
            + Add transaction
          </button>
        </div>

        <TransactionSearch
          value={filters}
          onChange={setFilters}
          products={choices.products}
          customers={choices.customers}
          suppliers={choices.suppliers}
          recorders={choices.recorders}
          banks={choices.banks}
          categories={choices.categories}
          showPayment={exec}
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

        {notice && (
          <div
            role="status"
            className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-[14px] ${
              notice.tone === "bad" ? "bg-danger/10 text-danger" : notice.tone === "good" ? "bg-success/10 text-success" : "bg-secondary"
            }`}
          >
            <span>{notice.text}</span>
            <span className="flex shrink-0 items-center gap-3">
              {notice.undo && (
                <button
                  type="button"
                  onClick={async () => {
                    const undo = notice.undo!;
                    setNotice({ tone: "wait", text: "Taking it back…" });
                    setNotice({ tone: "good", text: await undo() });
                  }}
                  className="font-semibold underline underline-offset-2"
                >
                  Undo
                </button>
              )}
              <button type="button" onClick={() => setNotice(null)} className="font-semibold">
                Dismiss
              </button>
            </span>
          </div>
        )}

        {effectiveKind === "INVEST" && (
          <p className="text-[13px] text-muted-foreground">
            Two kinds, kept apart from sales and expenses: <span className="font-semibold">money put in</span> by an owner or
            investor (money in, but not a sale) and <span className="font-semibold">things bought to keep</span> — machinery, a
            freezer (money out when paid, but not an everyday expense). Neither counts in money earned. Older investments recorded
            before this split were funded by the owners and stay out of money in and out.
          </p>
        )}

        <div className="overflow-hidden rounded-2xl border border-line/15 bg-card">
          <TransactionTable
            rows={rows}
            showPayment={exec}
            onEdit={setEditing}
            onDelete={(e) => deleteEntry(e.id)}
            carriedFrom={carriedFrom}
            owed={
              exec
                ? {
                    onSaved: (text, undo) => setNotice({ tone: "good", text, undo }),
                    onDefault: (e) => setDefaulting(rowFor(e)),
                    onMoveDue: (e) => setMovingDue(rowFor(e)),
                  }
                : undefined
            }
          />
          <div className="flex flex-wrap justify-between gap-2 border-t border-line/10 px-4 py-2.5 text-xs text-muted-foreground">
            <span>One row per product. Press a row for payments and notes, or the pencil to change the order.</span>
            <span>
              Showing {rows.length} {rows.length === 1 ? "transaction" : "transactions"}
              {carriedFrom.size > 0 ? ` · ${carriedFrom.size} from earlier months` : ""}
            </span>
          </div>
        </div>
      </div>

      {adding && (
        <TransactionDialog open onOpenChange={setAdding} existing={null} exec={exec} onSave={(draft) => addEntry(draft)} />
      )}
      {editing && editing.type !== "RND" && (
        <TransactionDialog
          key={editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          existing={editing}
          exec={exec}
          onSave={(draft) => replaceEntry(editing.id, draft)}
          onDelete={() => deleteEntry(editing.id)}
        />
      )}
      {/* Older owner-funded investments keep the form they were recorded with. */}
      {editing && editing.type === "RND" && (
        <QuickEditDialog
          key={editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          title="Change investment"
          initial={entryToDraft(editing)}
          allowedTypes={["RND"]}
          onSave={(draft) => replaceEntry(editing.id, draft)}
          onDelete={() => deleteEntry(editing.id)}
        />
      )}
      {defaulting && (
        <DefaultDialog entry={defaulting.entry} kind={defaulting.kind} onClose={() => setDefaulting(null)} onSaved={(text) => setNotice({ tone: "good", text })} />
      )}
      {movingDue && <DueDateDialog entry={movingDue.entry} onClose={() => setMovingDue(null)} onSaved={(text) => setNotice({ tone: "good", text })} />}
    </Page>
  );
}

/** One card, two figures: what actually moved, and what is still owed — labelled apart. */
function SplitCard({
  icon,
  title,
  tone,
  main,
  owed,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "good" | "bad";
  main: { label: string; value: number; note: string };
  owed: { label: string; value: number; note: string; alert?: boolean };
}) {
  const color = tone === "good" ? "text-success" : "text-danger";
  return (
    <div className={`flex flex-col rounded-2xl border bg-card ${owed.alert ? "border-danger/40" : "border-line/15"}`}>
      <span className="flex items-center gap-1.5 px-4 pt-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className={color}>{icon}</span>
        {title}
      </span>
      <div className="grid flex-1 grid-cols-2 gap-x-4 px-4 pb-3 pt-1.5">
        <div className="flex min-w-0 flex-col">
          <span className="text-[12.5px] font-semibold">{main.label}</span>
          <span className={`font-display text-[24px] font-bold leading-tight ${color}`}>{formatPeso(main.value)}</span>
          <span className="text-[11.5px] leading-snug text-muted-foreground">{main.note}</span>
        </div>
        <div className="flex min-w-0 flex-col border-l border-dashed border-line/25 pl-4">
          <span className="text-[12.5px] font-semibold">{owed.label}</span>
          <span className="font-display text-[24px] font-bold leading-tight">{formatPeso(owed.value)}</span>
          <span className={`text-[11.5px] leading-snug ${owed.alert ? "font-semibold text-danger" : "text-muted-foreground"}`}>{owed.note}</span>
        </div>
      </div>
    </div>
  );
}

function MoneyBox({
  icon,
  heading,
  label,
  value,
  note,
  tone,
  filled,
  alert,
}: {
  icon: React.ReactNode;
  /** Filled card only: the month, set above the figure. */
  heading?: string;
  label: string;
  value: number;
  note: string;
  tone: "good" | "bad" | "neutral";
  filled?: boolean;
  alert?: boolean;
}) {
  const color = tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-foreground";
  if (filled) {
    // The headline figure: green (red only when the month lost money), centred in its card,
    // with the month above it so the card reads on its own.
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 rounded-2xl border px-4 py-3 text-center text-white dark:text-ivory ${
          tone === "bad" ? "border-danger bg-danger" : "border-success bg-success"
        }`}
      >
        {heading && <span className="font-display text-[clamp(18px,1.8vw,22px)] font-bold leading-tight tracking-wide">{heading}</span>}
        <span className="flex items-center justify-center gap-1.5 text-[12.5px] font-semibold opacity-90 [&_svg]:h-4 [&_svg]:w-4">
          {icon}
          {label}
        </span>
        <span className="font-display max-w-full break-words text-[clamp(28px,2.8vw,36px)] font-bold leading-none tabular-nums">{formatPeso(value)}</span>
        <span className="max-w-[30ch] text-[12px] opacity-90">{note}</span>
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-1 rounded-2xl border bg-card px-5 py-4 ${alert ? "border-danger/50" : "border-line/15"}`}>
      <span className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
        <span className={color}>{icon}</span>
        {label}
      </span>
      <span className={`font-display text-[28px] font-bold ${color}`}>{formatPeso(value)}</span>
      <span className={`text-[12.5px] ${alert ? "font-bold text-danger" : "text-muted-foreground"}`}>{note}</span>
    </div>
  );
}

function Progress({ label, value, goal, empty, tone }: { label: string; value: number; goal: number; empty: string; tone: "good" | "warning" }) {
  const pct = goal > 0 ? (value / goal) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[13px]">
        <span>{label}</span>
        <span className="text-muted-foreground">{goal > 0 ? `${formatPeso(value)} of ${formatPeso(goal)} · ${Math.round(pct)}%` : empty}</span>
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
