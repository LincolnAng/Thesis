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
import { MovementList, ObligationList, SectionHead } from "@/components/transactions/obligation-list";
import { DefaultDialog, DueDateDialog, RecordPaymentDialog } from "@/components/transactions/obligation-dialogs";
import { useStore } from "@/lib/store/use-store";
import { addEntry, deleteEntry, replaceEntry } from "@/lib/store/store";
import { entryToDraft } from "@/lib/home/describe-entry";
import { computeExpensesSummary } from "@/lib/summary/expenses-summary";
import { salesTarget, setSalesTarget } from "@/lib/summary/business-config";
import { cashMovements, isAnyInvestment, monthOf, obligations, summarize, type ObligationRow } from "@/lib/transactions/ledger";
import { formatPeso, pluralize } from "@/lib/format";
import type { Entry, EntryType } from "@/lib/store/types";

type Direction = "in" | "out";
/** The filters under each side: which kinds of transaction to show. */
type Kind = "all" | "SALE" | "EXPENSE" | "INVEST" | "WASTE";
const IN_FILTERS: [Kind, string][] = [
  ["all", "All"],
  ["SALE", "Sales"],
];
const OUT_FILTERS: [Kind, string][] = [
  ["all", "All"],
  ["EXPENSE", "Expenses"],
  ["INVEST", "Investments"],
  ["WASTE", "Spoilage"],
];
const LEDGER_TYPES = new Set<EntryType>(["SALE", "EXPENSE", "RND", "CAPITAL", "ASSET", "WASTE"]);
const byNewest = (a: Entry, b: Entry) => b.timestamp.localeCompare(a.timestamp);

function monthLabel(key: string, style: "long" | "short" = "long") {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", style === "long" ? { month: "long", year: "numeric" } : { month: "short" });
}

/**
 * Transactions has two sides, Money In and Money Out. Each keeps what has actually changed
 * hands apart from what is still owed:
 *
 *   Money In  — Money Received  ·  Still Owed to Us
 *   Money Out — Money Paid      ·  We Still Owe
 *
 * Money Out also holds Investments and Spoilage, which are not payments the business made, in
 * sections of their own. Nothing in the "still owed" lists is ever counted in the money boxes
 * above; only a payment recorded against it is, on the day it was made.
 *
 * Payables, receivables and their deadlines live here, not on a page of their own. Executives
 * handle them; employees see sales and spoilage.
 */
function TransactionsPageInner() {
  const { entries, categoryBudgets, businessSettings } = useStore();
  const exec = isExecutive(useCurrentUser());
  const searchParams = useSearchParams();
  // Arriving from a supplier's "See spending" link: show only what was paid to them.
  const supplierFilter = searchParams.get("supplier");

  const [direction, setDirection] = useState<Direction>(supplierFilter ? "out" : "in");
  const [kind, setKind] = useState<Kind>("all");
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [paying, setPaying] = useState<ObligationRow | null>(null);
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

  // Which filters each side offers. Employees never see investments.
  const filtersRow = direction === "in" ? IN_FILTERS : exec ? OUT_FILTERS : OUT_FILTERS.filter(([k]) => k !== "INVEST");
  // A filter left over from the other side falls back to All.
  const effectiveKind: Kind = filtersRow.some(([k]) => k === kind) ? kind : "all";
  const showing = (k: Kind) => effectiveKind === "all" || effectiveKind === k;
  const showCash = direction === "in" ? showing("SALE") : showing("EXPENSE");
  const showObligations = exec && showCash;
  const showInvestments = exec && direction === "out" && showing("INVEST");
  const showSpoilage = direction === "out" && showing("WASTE");

  const byId = useMemo(() => new Map(ledger.map((e) => [e.id, e])), [ledger]);
  const inPeriod = (day: string) => period === "all" || day.slice(0, 7) === period;

  // Money that actually changed hands in the period, on the day it did.
  const movements = useMemo(() => cashMovements(ledger), [ledger]);
  const movementsShown = movements.filter((m) => {
    const e = byId.get(m.entryId);
    return inPeriod(m.date) && !!e && matches(e);
  });
  const received = movementsShown.filter((m) => m.direction === "in");
  const paid = movementsShown.filter((m) => m.direction === "out");

  // What is still owed: made in the period, or made earlier and still not fully paid.
  const owedShown = (kindOf: "receivable" | "payable") =>
    obligations(ledger, kindOf, now).filter(
      (r) => (period === "all" || monthOf(r.entry) === period || (monthOf(r.entry) < period && r.info.remaining > 0)) && matches(r.entry),
    );
  const receivables = owedShown("receivable");
  const payables = owedShown("payable");
  const fromLabel = (r: ObligationRow) => (period !== "all" && monthOf(r.entry) < period ? monthLabel(monthOf(r.entry)) : null);

  const periodRows = (period === "all" ? ledger : ledger.filter((e) => monthOf(e) === period)).filter(matches).sort(byNewest);
  const investmentsShown = periodRows.filter(isAnyInvestment);
  const spoilageShown = periodRows.filter((e) => e.type === "WASTE");

  const editEntry = (entryId: string) => {
    const e = byId.get(entryId);
    if (e) setEditing(e);
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
                label: "Still owed to us",
                value: summary.receivables,
                note: summary.overdueReceivables
                  ? `Receivables · ${pluralize(summary.overdueReceivables, "payment")} overdue`
                  : "Receivables — not counted as money in until paid",
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
                label: "We still owe",
                value: summary.payables,
                note: summary.overduePayables
                  ? `Payables · ${pluralize(summary.overduePayables, "payment")} overdue`
                  : "Payables — not counted as money out until paid",
                alert: summary.overduePayables > 0,
              }}
            />
            <MoneyBox
              icon={<CircleDollarSign className="h-5 w-5" />}
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

        {/* The two sides. */}
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Money in or money out">
          {(
            [
              ["in", "Money In", "Received and still owed to us"],
              ["out", "Money Out", "Paid and still owed by us"],
            ] as const
          ).map(([d, label, hint]) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={direction === d}
              onClick={() => setDirection(d)}
              className={`min-h-[64px] rounded-2xl border px-4 py-2 text-left transition ${
                direction === d ? "border-cacao bg-cacao text-ivory shadow-sm" : "border-line/20 bg-card hover:bg-secondary/50"
              }`}
            >
              <span className="block font-display text-[20px] font-semibold">{label}</span>
              <span className={`block text-[13px] ${direction === d ? "text-ivory/85" : "text-muted-foreground"}`}>{hint}</span>
            </button>
          ))}
        </div>

        {/* The existing filters, with the add button beside them. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-[10px] bg-secondary p-1" role="group" aria-label="Kind of transaction">
            {filtersRow.map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={effectiveKind === k}
                onClick={() => setKind(k)}
                className={`min-h-10 shrink-0 rounded-lg px-4 py-2 text-[14px] ${effectiveKind === k ? "bg-card font-semibold shadow-sm" : "font-medium text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
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

        {/* Money In */}
        {direction === "in" && (
          <>
            <section className="space-y-3" aria-labelledby="received-title">
              <SectionHead
                title="Money Received"
                note={`Cash and bank transfers that have actually come in · ${periodName}`}
              />
              <MovementList rows={received} direction="in" total={received.reduce((s, m) => s + m.amount, 0)} onEdit={editEntry} />
            </section>
            {showObligations && (
              <section className="space-y-3">
                <SectionHead
                  title="Still Owed to Us"
                  note="Money customers have not paid yet. It only counts as received once a payment is recorded."
                />
                <ObligationList
                  rows={receivables}
                  kind="receivable"
                  canAct={exec}
                  fromLabel={fromLabel}
                  onPay={setPaying}
                  onDefault={setDefaulting}
                  onMoveDue={setMovingDue}
                  onEdit={(r) => setEditing(r.entry)}
                />
              </section>
            )}
          </>
        )}

        {/* Money Out */}
        {direction === "out" && (
          <>
            {exec && showCash && (
              <section className="space-y-3">
                <SectionHead title="Money Paid" note={`Cash and bank transfers that have actually gone out · ${periodName}`} />
                <MovementList rows={paid} direction="out" total={paid.reduce((s, m) => s + m.amount, 0)} onEdit={editEntry} />
              </section>
            )}
            {showObligations && (
              <section className="space-y-3">
                <SectionHead title="We Still Owe" note="Money we have not paid yet. It only counts as paid once a payment is recorded." />
                <ObligationList
                  rows={payables}
                  kind="payable"
                  canAct={exec}
                  fromLabel={fromLabel}
                  onPay={setPaying}
                  onDefault={setDefaulting}
                  onMoveDue={setMovingDue}
                  onEdit={(r) => setEditing(r.entry)}
                />
              </section>
            )}
            {showInvestments && (
              <section className="space-y-3">
                <SectionHead
                  title="Investments"
                  note="Money put in by an owner or investor, and things bought to keep — machinery, a freezer. Kept apart from sales and expenses; neither counts in money earned."
                />
                <TransactionTable rows={investmentsShown} showPayment={exec} onEdit={setEditing} />
              </section>
            )}
            {showSpoilage && (
              <section className="space-y-3">
                <SectionHead title="Spoilage" note="Stock that was lost. No cash moved, so it isn't in Money Paid." />
                <TransactionTable rows={spoilageShown} showPayment={exec} onEdit={setEditing} />
              </section>
            )}
          </>
        )}
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
      {paying && (
        <RecordPaymentDialog
          entry={paying.entry}
          kind={paying.kind}
          remaining={paying.info.remaining}
          onClose={() => setPaying(null)}
          onSaved={(text) => setNotice({ tone: "good", text })}
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
        <span className="flex items-center gap-2 text-[13px] font-semibold text-white/90">
          {icon}
          {label}
        </span>
        <span className="font-display text-[28px] font-bold">{formatPeso(value)}</span>
        <span className="text-[12.5px] text-white/90">{note}</span>
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
