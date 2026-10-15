"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, CircleDollarSign } from "lucide-react";
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
import { TransactionDialog } from "@/components/transactions/transaction-dialog";
import { EMPTY_FILTERS, TransactionSearch, type TransactionFilters } from "@/components/transactions/transaction-search";
import { DefaultDialog, DueDateDialog } from "@/components/transactions/obligation-dialogs";
import { useStore } from "@/lib/store/use-store";
import { addEntry, deleteEntry, replaceEntry } from "@/lib/store/store";
import { entryToDraft } from "@/lib/home/describe-entry";
import { computeExpensesSummary } from "@/lib/summary/expenses-summary";
import { salesTarget, setSalesTarget } from "@/lib/summary/business-config";
import { canBeOwed, cashMovements, isAnyInvestment, monthOf, obligationKind, obligations, outstanding, summarize, type ObligationRow } from "@/lib/transactions/ledger";
import { formatPeso, pluralize } from "@/lib/format";
import type { Entry, EntryType } from "@/lib/store/types";

/** Which kinds of transaction the list shows. One list, never split by direction. */
type Kind = "all" | "SALE" | "EXPENSE" | "RECEIVABLE" | "PAYABLE" | "INVEST" | "WASTE";
const KINDS: [Kind, string][] = [
  ["all", "All"],
  ["SALE", "Sales"],
  ["EXPENSE", "Expenses"],
  ["RECEIVABLE", "Receivables"],
  ["PAYABLE", "Payables"],
  ["INVEST", "Investments"],
  ["WASTE", "Spoilage"],
];
// Employees see sales, everyday expenses and spoilage — never what is owed or invested.
const EMPLOYEE_KINDS: Kind[] = ["all", "SALE", "EXPENSE", "WASTE"];
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
  const { entries, categoryBudgets, businessSettings } = useStore();
  const exec = isExecutive(useCurrentUser());
  const searchParams = useSearchParams();
  // Arriving from a supplier's "See spending" link: show only what was paid to them.
  const supplierFilter = searchParams.get("supplier");

  const [kind, setKind] = useState<Kind>(supplierFilter ? "EXPENSE" : "all");
  const [view, setView] = useState<"log" | "RECEIVABLE" | "PAYABLE">("log");
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [defaulting, setDefaulting] = useState<ObligationRow | null>(null);
  const [movingDue, setMovingDue] = useState<ObligationRow | null>(null);
  const [editBudgets, setEditBudgets] = useState(false);
  const [notice, setNotice] = useState<{ tone: "wait" | "good" | "bad"; text: string } | null>(null);
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

  // What the filter dropdowns offer: only values that actually occur.
  const choices = useMemo(() => {
    const uniq = (list: (string | null | undefined)[]) => [...new Set(list.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    return {
      // A multi-product order offers each of its products, not the joined list.
      products: uniq(ledger.flatMap((e) => (e.lineItems?.length ? e.lineItems.map((l) => l.name) : [e.sku]))),
      people: uniq(ledger.map((e) => e.counterparty)),
      recorders: uniq(ledger.map((e) => e.loggedByName)),
    };
  }, [ledger]);

  // The search bar and filters, applied to a transaction (or to the one a payment was made on).
  const matches = (e: Entry) => {
    if (supplierFilter && (e.counterparty ?? "").toLowerCase() !== supplierFilter.toLowerCase()) return false;
    if (filters.product && e.sku !== filters.product && !e.lineItems?.some((l) => l.name === filters.product)) return false;
    if (filters.person && e.counterparty !== filters.person) return false;
    if (filters.recordedBy && e.loggedByName !== filters.recordedBy) return false;
    const q = filters.text.trim().toLowerCase();
    if (q) {
      const hay = [e.sku, e.counterparty, e.rawText, e.notes, e.loggedByName, e.bankName].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  // Receivables and payables are tabs of their own; the carousel steps through the rest.
  const kinds = (exec ? KINDS : KINDS.filter(([k]) => EMPLOYEE_KINDS.includes(k))).filter(([k]) => k !== "RECEIVABLE" && k !== "PAYABLE");
  const logKind: Kind = kinds.some(([k]) => k === kind) ? kind : "all";
  const effectiveKind: Kind = exec && view !== "log" ? view : logKind;
  const openCount = (k: "receivable" | "payable") => ledger.filter((e) => obligationKind(e) === k && outstanding(e) > 0).length;
  const stepKind = (by: 1 | -1) => {
    const at = Math.max(0, kinds.findIndex(([k]) => k === logKind));
    setKind(kinds[(at + by + kinds.length) % kinds.length][0]);
  };
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
      default:
        return e.type === effectiveKind;
    }
  };

  // The list: what was made in the period, plus — for executives — earlier receivables and
  // payables still unpaid or paid during it, so a debt isn't forgotten when the calendar turns.
  const madeIn = (e: Entry) => period === "all" || monthOf(e) === period;
  const earlierRows = exec && period !== "all"
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
          (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
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
            className={`min-h-10 rounded-full border px-4 text-[14px] ${
              period === "all" ? "border-cacao bg-cacao font-semibold text-ivory" : "border-line/15 bg-card font-medium text-muted-foreground"
            }`}
          >
            All time
          </button>
        </div>

        {/* Three cards. Cash that actually moved sits beside what is still owed, each in its own
            labelled figure — never added together — and the third is earnings, as before. */}
        {exec ? (
          <section className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-3" aria-label="Money summary">
            <SplitCard
              icon={<ArrowDownLeft className="h-5 w-5" />}
              title="Money in & receivables"
              tone="good"
              main={{
                label: "Money received",
                value: summary.moneyIn,
                note:
                  summary.capitalIn > 0
                    ? `Cash that came in · ${periodName} · includes ${formatPeso(summary.capitalIn)} capital put in`
                    : `Cash that came in · ${periodName}`,
              }}
              owed={{
                label: "Receivables",
                value: summary.receivables,
                note: summary.overdueReceivables
                  ? `${pluralize(summary.overdueReceivables, "payment")} overdue`
                  : "Owed by customers — not money in until paid",
                alert: summary.overdueReceivables > 0,
              }}
            />
            <SplitCard
              icon={<ArrowUpRight className="h-5 w-5" />}
              title="Money out & payables"
              tone="bad"
              main={{
                label: "Money paid",
                value: summary.moneyOut,
                note:
                  summary.assetsOut > 0
                    ? `Cash that went out · ${periodName} · includes ${formatPeso(summary.assetsOut)} for long-term assets`
                    : `Cash that went out · ${periodName}`,
              }}
              owed={{
                label: "Payables",
                value: summary.payables,
                note: summary.overduePayables
                  ? `${pluralize(summary.overduePayables, "payment")} overdue`
                  : "Owed to suppliers — not money out until paid",
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
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2" aria-label="Sales summary">
            <MoneyBox icon={<ArrowDownLeft className="h-5 w-5" />} label="Sales" value={summary.sales} tone="good" note={`Everything sold · ${periodName}`} />
            {/* Everyday expenses only — salaries never reach an employee's screen. */}
            <MoneyBox icon={<ArrowUpRight className="h-5 w-5" />} label="Expenses" value={summary.expenses} tone="bad" note={`Everyday expenses · ${periodName}`} />
          </section>
        )}

        {exec && (
          <section className="flex flex-col gap-4 rounded-2xl border border-line/15 bg-card p-5" aria-labelledby="target-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="target-title" className="text-[15px] font-semibold">
                Sales target & budget · {periodName}
              </h2>
              <button type="button" onClick={() => setEditBudgets((v) => !v)} className="min-h-10 text-[13px] font-semibold text-cacao">
                {editBudgets ? "Done editing" : "Edit target & budgets"}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-5 min-[800px]:grid-cols-2">
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
          <div className="flex flex-wrap items-center gap-3">
            {/* Executives get what is owed as tabs of its own, with how many are still open. */}
            {exec && (
              <div className="flex gap-1 rounded-xl bg-secondary p-1" role="tablist" aria-label="Transactions, receivables or payables">
                {(
                  [
                    ["log", "Transactions", 0],
                    ["PAYABLE", "Payables", openCount("payable")],
                    ["RECEIVABLE", "Receivables", openCount("receivable")],
                  ] as const
                ).map(([v, label, count]) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    onClick={() => setView(v)}
                    className={`flex min-h-10 items-center gap-1.5 rounded-lg px-4 text-[14px] font-semibold transition ${
                      view === v ? "bg-cacao text-ivory shadow-sm" : "text-muted-foreground hover:bg-card/70"
                    }`}
                  >
                    {label}
                    {count > 0 && (
                      <span className={`rounded-full px-1.5 text-[11.5px] font-bold ${view === v ? "bg-ivory/20" : "bg-cacao/10 text-cacao"}`}>{count}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {/* A carousel through the log: everything, then each kind in turn. */}
            {view === "log" && (
              <CarouselNav
                wrap
                size="large"
                label={kinds.find(([k]) => k === logKind)?.[1] ?? "All"}
                labelWidth="min-w-[140px]"
                onPrev={() => stepKind(-1)}
                onNext={() => stepKind(1)}
                prevLabel="Previous kind of transaction"
                nextLabel="Next kind of transaction"
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="min-h-11 rounded-[10px] bg-cacao px-5 text-[14px] font-semibold text-ivory"
          >
            + Add transaction
          </button>
        </div>

        <TransactionSearch value={filters} onChange={setFilters} products={choices.products} people={choices.people} recorders={choices.recorders} />

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
            <button type="button" onClick={() => setNotice(null)} className="shrink-0 font-semibold">
              Dismiss
            </button>
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
            carriedFrom={carriedFrom}
            owed={
              exec
                ? {
                    onSaved: (text) => setNotice({ tone: "good", text }),
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
      <span className="flex items-center gap-2 px-5 pt-4 text-[13px] font-semibold text-muted-foreground">
        <span className={color}>{icon}</span>
        {title}
      </span>
      <div className="flex flex-col gap-0.5 px-5 pb-3 pt-2">
        <span className="text-[13px] font-semibold">{main.label}</span>
        <span className={`font-display text-[28px] font-bold leading-tight ${color}`}>{formatPeso(main.value)}</span>
        <span className="text-[12px] text-muted-foreground">{main.note}</span>
      </div>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-dashed border-line/20 bg-secondary/40 px-5 py-3">
        <span className="text-[13px] font-semibold">{owed.label}</span>
        <span className="font-display text-[22px] font-bold leading-tight">{formatPeso(owed.value)}</span>
        <span className={`text-[12px] ${owed.alert ? "font-semibold text-danger" : "text-muted-foreground"}`}>{owed.note}</span>
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
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border px-5 py-6 text-center text-white dark:text-ivory ${
          tone === "bad" ? "border-danger bg-danger" : "border-success bg-success"
        }`}
      >
        {heading && <span className="font-display text-[clamp(24px,2.6vw,32px)] font-bold leading-tight tracking-wide">{heading}</span>}
        <span className="flex items-center justify-center gap-2 text-[14px] font-semibold opacity-90">
          {icon}
          {label}
        </span>
        <span className="font-display max-w-full break-words text-[clamp(32px,3.6vw,46px)] font-bold leading-none tabular-nums">{formatPeso(value)}</span>
        <span className="mt-1 max-w-[30ch] text-[13px] opacity-90">{note}</span>
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[14px]">
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
