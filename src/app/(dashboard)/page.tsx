"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeftRight, Box, CalendarDays, CircleDollarSign, Tag, Users, type LucideIcon } from "lucide-react";
import { Page } from "@/components/layout/page";
import { HomeChat } from "@/components/home/home-chat";
import { ViewModeToggle } from "@/components/summary/view-mode-toggle";
import { Bar } from "@/components/summary/bar";
import { StatTile } from "@/components/data-table/stat-tile";
import { ProfitWaterfall } from "@/components/summary/profit-waterfall";
import { ProfitOverlayChart } from "@/components/summary/profit-overlay-chart";
import { ChartGrid } from "@/components/layout/containers";
import { CogsPercentChart } from "@/components/summary/cogs-percent-chart";
import { ExpensesCategoryChart } from "@/components/summary/expenses-category-chart";
import { ProfitableProductsList } from "@/components/summary/profitable-products-list";
import { SupplierPriceSummaryChart } from "@/components/summary/supplier-price-summary-chart";
import { useStore } from "@/lib/store/use-store";
import { currentMonthLabel, formatPeso, pluralize } from "@/lib/format";
import { forecastAll } from "@/lib/summary/forecast";
import { productCostPerJar, effectiveProductPrice } from "@/lib/summary/recipe-cost";
import { eventPlan } from "@/lib/summary/business-config";
import { setSectionHidden, useSectionHidden, type HomeSection } from "@/lib/home/glance-visibility";
import type { BusinessEvent, Entry, Product } from "@/lib/store/types";
import type { CostContext } from "@/lib/summary/recipe-cost";
import { computeSalesSummary } from "@/lib/summary/sales-summary";
import { computeExpensesSummary, monthlyExpensesByCategory } from "@/lib/summary/expenses-summary";
import { computeMonthlyProfitTrend, computeProductMarginRanking } from "@/lib/summary/profit-summary";
import { useViewMode } from "@/lib/summary/view-mode";
import { useCostContext } from "@/lib/summary/use-cost-context";

interface Tile {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  tone?: "good" | "bad";
  valueTone?: "good" | "bad";
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function buildTiles(
  entries: Entry[],
  products: Product[],
  events: BusinessEvent[],
  settings: Parameters<typeof eventPlan>[0],
  costCtx: CostContext,
): Tile[] {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const money = (list: Entry[], type: "SALE" | "EXPENSE") =>
    list.filter((e) => e.type === type).reduce((s, e) => s + (e.amount ?? 0), 0);

  const thisMonth = entries.filter((e) => monthKey(e.timestamp) === month);
  const prevMonth = entries.filter((e) => monthKey(e.timestamp) === lastMonth);
  const inflow = money(thisMonth, "SALE");
  const outflow = money(thisMonth, "EXPENSE");
  const profit = inflow - outflow;
  const lastProfit = prevMonth.length ? money(prevMonth, "SALE") - money(prevMonth, "EXPENSE") : null;
  const sales = thisMonth.filter((e) => e.type === "SALE");
  const expenseCount = thisMonth.filter((e) => e.type === "EXPENSE").length;
  const buyers = [...new Set(sales.map((e) => e.counterparty).filter((c): c is string => !!c))];

  const forecasts = forecastAll(products, entries, now);
  const low = products
    .map((p) => ({ p, need: forecasts.find((f) => f.productId === p.id)?.forecastQty ?? 0 }))
    .filter(({ p, need }) => p.stockQty <= p.lowStockThreshold || p.stockQty < need)
    .sort((a, b) => a.p.stockQty / Math.max(1, a.need) - b.p.stockQty / Math.max(1, b.need));

  const today = now.toISOString().slice(0, 10);
  const next = events
    .filter((e) => e.status === "open" && e.startDate && e.startDate.slice(0, 10) > today)
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))[0];
  const daysAway = next?.startDate ? Math.ceil((new Date(next.startDate).getTime() - now.getTime()) / 86400000) : 0;
  const bringing = next ? Object.values(eventPlan(settings, next.id)).reduce((s, n) => s + n, 0) : 0;

  const margins = products
    .map((p) => {
      const cost = productCostPerJar(p, costCtx);
      const price = effectiveProductPrice(p, cost);
      return { p, price, pct: price > 0 ? ((price - cost.costPerJar) / price) * 100 : 0 };
    })
    .sort((a, b) => b.pct - a.pct);
  const best = margins[0];
  const pctOfSales = inflow > 0 ? Math.round((profit / inflow) * 100) : 0;

  return [
    {
      href: "/transactions",
      icon: ArrowLeftRight,
      label: "Transactions — this month",
      value: `${formatPeso(inflow)} in · ${formatPeso(outflow)} out`,
      note: `${pluralize(sales.length, "sale")} · ${pluralize(expenseCount, "expense")} logged`,
    },
    {
      href: "/transactions",
      icon: CircleDollarSign,
      label: "Profit — this month",
      value: formatPeso(profit),
      valueTone: profit >= 0 ? "good" : "bad",
      note:
        lastProfit === null
          ? `${pctOfSales}% of sales`
          : `${profit >= lastProfit ? "↑" : "↓"} ${formatPeso(Math.abs(profit - lastProfit))} vs last month · ${pctOfSales}% of sales`,
      tone: profit >= 0 && (lastProfit === null || profit >= lastProfit) ? "good" : "bad",
    },
    low.length
      ? {
          href: "/inventory",
          icon: Box,
          label: "Inventory — running low",
          value: `${low[0].p.name}: ${low[0].p.stockQty} left`,
          note: low.length > 1 ? `+ ${low.slice(1, 3).map((l) => l.p.name).join(", ")}${low.length > 3 ? ` +${low.length - 3} more` : ""}` : "Restock soon",
          tone: "bad",
        }
      : { href: "/inventory", icon: Box, label: "Inventory", value: "Stock looks healthy", note: "Covers next month's forecast", tone: "good" },
    {
      href: "/people",
      icon: Users,
      label: "People — this month",
      value: `${pluralize(sales.length, "order")} · ${pluralize(buyers.length, "customer")}`,
      note: buyers.length ? `${buyers.slice(0, 2).join(", ")}${buyers.length > 2 ? ` +${buyers.length - 2} more` : ""}` : "No orders yet",
    },
    next
      ? {
          href: "/people?tab=events",
          icon: CalendarDays,
          label: "Events — coming up",
          value: next.name,
          note: `${pluralize(daysAway, "day")} away${bringing ? ` · bringing ${bringing}` : ""}`,
        }
      : { href: "/people?tab=events", icon: CalendarDays, label: "Events", value: "Nothing planned", note: "Add one under People → Events" },
    best
      ? {
          href: "/pricing",
          icon: Tag,
          label: "Pricing — best margin",
          value: `${best.p.name} — ${formatPeso(best.price)}`,
          note: `${Math.round(best.pct)}% margin`,
          tone: best.pct >= 15 ? "good" : "bad",
        }
      : { href: "/pricing", icon: Tag, label: "Pricing", value: "No products yet", note: "Add products first" },
  ];
}

/** A Home section with a Hide link; once hidden, a single "Show …" button brings it back. */
function HideableSection({ section, title, children }: { section: HomeSection; title: string; children: React.ReactNode }) {
  const hidden = useSectionHidden(section);
  if (hidden) {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setSectionHidden(section, false)}
          className="rounded-full border border-line/15 bg-white px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Show {title.split(" · ")[0].toLowerCase()}
        </button>
      </div>
    );
  }
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <button type="button" onClick={() => setSectionHidden(section, true)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
          Hide
        </button>
      </div>
      {children}
    </section>
  );
}

function TodayAtAGlance({ tiles }: { tiles: Tile[] }) {
  return (
    <HideableSection section="glance" title="Today at a glance">
      <div className="grid grid-cols-1 gap-[18px] min-[700px]:grid-cols-2 min-[1100px]:grid-cols-3">
        {tiles.map((t) => {
          const alert = t.tone === "bad" && t.icon === Box;
          return (
            <Link
              key={t.label}
              href={t.href}
              className={`flex flex-col gap-2.5 rounded-2xl border bg-white p-[22px] transition hover:shadow-sm ${alert ? "border-danger/35" : "border-line/15"}`}
            >
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${alert ? "bg-danger/10" : "bg-cacao/10"}`}>
                <t.icon className={`h-[21px] w-[21px] ${alert ? "text-danger" : "text-cacao"}`} strokeWidth={1.8} />
              </span>
              <span className="text-sm font-semibold text-muted-foreground">{t.label}</span>
              <span
                className={`font-display text-[19px] font-semibold ${t.valueTone === "good" ? "text-success" : t.valueTone === "bad" ? "text-danger" : ""}`}
              >
                {t.value}
              </span>
              <span className={`text-[13px] font-semibold ${t.tone === "good" ? "text-success" : t.tone === "bad" ? "text-danger" : "text-muted-foreground"}`}>
                {t.note}
              </span>
            </Link>
          );
        })}
      </div>
    </HideableSection>
  );
}

export default function HomePage() {
  const { entries, products, suppliers, categoryBudgets, events, businessSettings } = useStore();
  const [viewMode] = useViewMode();
  const costCtx = useCostContext();

  const sales = useMemo(
    () => computeSalesSummary(entries, products, costCtx),
    [entries, products, costCtx],
  );
  const expenses = useMemo(() => computeExpensesSummary(entries, categoryBudgets), [entries, categoryBudgets]);
  const profitTrend = useMemo(
    () => computeMonthlyProfitTrend(entries, products, costCtx),
    [entries, products, costCtx],
  );
  const marginRanking = useMemo(
    () => computeProductMarginRanking(entries, products, costCtx),
    [entries, products, costCtx],
  );
  const expensesByCategory = useMemo(() => monthlyExpensesByCategory(entries), [entries]);
  const profitThisMonth = profitTrend[profitTrend.length - 1];
  const netProfit = profitThisMonth?.netProfit ?? 0;
  const cogsPct = profitThisMonth?.cogsPct ?? 0;
  const expensesPct = sales.revenue > 0 ? (expenses.total / sales.revenue) * 100 : 0;

  const tiles = useMemo(
    () => buildTiles(entries, products, events, businessSettings, costCtx),
    [entries, products, events, businessSettings, costCtx],
  );

  return (
    <Page title="Home" right={<ViewModeToggle />}>
    <div className="space-y-14 pb-4">
      <HomeChat />

      {viewMode === "simple" && <TodayAtAGlance tiles={tiles} />}

      {viewMode === "advanced" && (
        <HideableSection section="overview" title={`Business overview · ${currentMonthLabel()}`}>
          <ProfitWaterfall
            revenue={sales.revenue}
            cogs={profitThisMonth?.cogs ?? 0}
            expenses={expenses.total}
            netProfit={netProfit}
            periodLabel={currentMonthLabel()}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Gross margin" value={`${Math.round(sales.grossMarginPct)}%`} sub="this month" />
          </div>

          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Financial health</h2>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">Ingredient cost (COGS)</span>
                <span className="text-muted-foreground">{Math.round(cogsPct)}% of revenue</span>
              </div>
              <Bar pct={cogsPct} tone="warning" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">Other expenses</span>
                <span className="text-muted-foreground">{Math.round(expensesPct)}% of revenue</span>
              </div>
              <Bar pct={expensesPct} tone="warning" />
            </div>
          </div>

          <ProfitOverlayChart data={profitTrend} />

          <ChartGrid>
            <CogsPercentChart data={profitTrend} />
            <ExpensesCategoryChart data={expensesByCategory} />
            <SupplierPriceSummaryChart suppliers={suppliers} />
            <ProfitableProductsList rows={marginRanking} />
          </ChartGrid>
        </HideableSection>
      )}

    </div>
    </Page>
  );
}
