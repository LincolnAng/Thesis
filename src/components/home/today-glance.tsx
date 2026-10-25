"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Box, CircleDollarSign, Receipt, Wallet } from "lucide-react";
import { formatPeso, pluralize } from "@/lib/format";
import type { Glance } from "@/lib/home/today";

/**
 * Today at a glance, as plain figures: no charts, no icons to decode. Each card is one number
 * and one line saying what it is compared with or why it can't be shown.
 */
export function TodayGlance({ glance }: { glance: Glance }) {
  const diff = glance.salesToday - glance.salesYesterday;
  const net = glance.netIncomeToday;

  return (
    <section className="space-y-3" aria-labelledby="glance-title">
      <h2 id="glance-title" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Today at a glance
      </h2>
      <div className="grid grid-cols-2 gap-3 min-[1000px]:grid-cols-4">
        <Card href="/transactions" icon={<Wallet className="h-5 w-5 text-cacao" strokeWidth={1.8} />} label="Sales today" value={formatPeso(glance.salesToday)}>
          {glance.salesYesterday === 0 && glance.salesToday === 0 ? (
            "No sales yet today or yesterday"
          ) : (
            <span className={`inline-flex items-center gap-1 ${diff >= 0 ? "text-success" : "text-danger"}`}>
              {diff >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {formatPeso(Math.abs(diff))} {diff >= 0 ? "more" : "less"} than yesterday
            </span>
          )}
        </Card>

        {glance.expensesToday !== null && (
          <Card href="/transactions" icon={<Receipt className="h-5 w-5 text-cacao" strokeWidth={1.8} />} label="Expenses today" value={formatPeso(glance.expensesToday)}>
            {glance.expenseCountToday ? `${pluralize(glance.expenseCountToday, "expense")} recorded` : "Nothing recorded yet"}
          </Card>
        )}

        {net !== null && (
          <Card
            href="/transactions"
            icon={<CircleDollarSign className="h-5 w-5 text-cacao" strokeWidth={1.8} />}
            label="Net income today"
            value={"value" in net ? formatPeso(net.value) : "Unavailable"}
            valueTone={"value" in net ? (net.value >= 0 ? "good" : "bad") : "muted"}
          >
            {"value" in net ? "After product costs and expenses" : `${net.unavailable.charAt(0).toUpperCase()}${net.unavailable.slice(1)}`}
          </Card>
        )}

        <Card
          href="/production"
          icon={<Box className={`h-5 w-5 ${glance.inventoryAlerts ? "text-danger" : "text-cacao"}`} strokeWidth={1.8} />}
          label="Stock alerts"
          value={glance.inventoryAlerts ? pluralize(glance.inventoryAlerts, "item") : "None"}
          valueTone={glance.inventoryAlerts ? "bad" : "good"}
          alert={glance.inventoryAlerts > 0}
        >
          {glance.inventoryAlerts ? "At or below the restock level" : "Everything is above its restock level"}
        </Card>
      </div>
    </section>
  );
}

function Card({
  href,
  icon,
  label,
  value,
  valueTone,
  alert,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  valueTone?: "good" | "bad" | "muted";
  alert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col gap-1.5 rounded-2xl border bg-card p-5 transition hover:shadow-sm ${alert ? "border-danger/35" : "border-line/15"}`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        className={`font-display text-[26px] font-semibold leading-tight ${
          valueTone === "good" ? "text-success" : valueTone === "bad" ? "text-danger" : valueTone === "muted" ? "text-muted-foreground" : ""
        }`}
      >
        {value}
      </span>
      <span className="text-[13px] text-muted-foreground">{children}</span>
    </Link>
  );
}
