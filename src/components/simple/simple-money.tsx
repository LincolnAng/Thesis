"use client";

import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { QuickEditDialog } from "@/components/home/quick-edit-dialog";
import { SettingNumberInput } from "@/components/ui/setting-number-input";
import { useStore } from "@/lib/store/use-store";
import { addEntry, deleteEntry, replaceEntry } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { entryToDraft } from "@/lib/home/describe-entry";
import { computeExpensesSummary } from "@/lib/summary/expenses-summary";
import { salesTarget, setSalesTarget } from "@/lib/summary/business-config";
import { formatPeso } from "@/lib/format";
import type { Entry } from "@/lib/store/types";
import {
  AdvancedHint,
  BigButton,
  Em,
  Gauge,
  Headline,
  SectionTitle,
  SentenceList,
  SentenceRow,
  entrySentence,
  monthKey,
  monthKeyOf,
  monthName,
  shortDay,
} from "@/components/simple/simple-ui";

const SHOW_FIRST = 8;

/** Money in Simple mode: what came in, what went out, what you kept — in one sentence. */
export function SimpleMoney() {
  const { entries, categoryBudgets, businessSettings } = useStore();
  const [offset, setOffset] = useState<0 | -1>(0);
  const [adding, setAdding] = useState<"SALE" | "EXPENSE" | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);

  const month = monthKey(offset);
  const rows = entries
    .filter((e) => (e.type === "SALE" || e.type === "EXPENSE") && monthKeyOf(e.timestamp) === month)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const moneyIn = rows.filter((e) => e.type === "SALE").reduce((s, e) => s + (e.amount ?? 0), 0);
  const moneyOut = rows.filter((e) => e.type === "EXPENSE").reduce((s, e) => s + (e.amount ?? 0), 0);
  const kept = moneyIn - moneyOut;
  const goal = salesTarget(businessSettings);
  const budget = computeExpensesSummary(entries, categoryBudgets).budget;
  const name = monthName(month);
  const visible = showAll ? rows : rows.slice(0, SHOW_FIRST);

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6">
      <div className="flex w-fit gap-1.5 rounded-[10px] bg-secondary p-1">
        {(
          [
            [0, "This month"],
            [-1, "Last month"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => (setOffset(k), setShowAll(false))}
            className={`rounded-lg px-4 py-2 text-[13px] ${offset === k ? "bg-white font-semibold shadow-sm" : "font-medium text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Headline sub="Tap a button below to add your first one.">Nothing recorded for {name} yet.</Headline>
      ) : kept >= 0 ? (
        <Headline tone="good" sub="“Kept” is what’s left from your sales after paying for things.">
          In {name} you sold <Em>{formatPeso(moneyIn)}</Em> and spent <Em>{formatPeso(moneyOut)}</Em> — you kept <Em tone="good">{formatPeso(kept)}</Em>.
        </Headline>
      ) : (
        <Headline tone="bad" sub="That can happen in a month you buy a lot of ingredients — it usually evens out when they’re sold.">
          In {name} you spent <Em tone="bad">{formatPeso(-kept)}</Em> more than you made from sales.
        </Headline>
      )}

      <div className="flex flex-col gap-5 rounded-2xl border border-line/15 bg-white p-5">
        {goal > 0 && !editingGoal ? (
          <Gauge
            label="Sales goal"
            pct={(moneyIn / goal) * 100}
            tone={moneyIn >= goal ? "good" : "neutral"}
            text={
              <>
                {Math.round((moneyIn / goal) * 100)}% of your {formatPeso(goal)} goal ·{" "}
                <button type="button" onClick={() => setEditingGoal(true)} className="font-semibold text-cacao">
                  change
                </button>
              </>
            }
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Sales goal</div>
              <div className="text-[13px] text-muted-foreground">How much you&apos;d like to sell each month.</div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              ₱
              <SettingNumberInput value={goal} onCommit={setSalesTarget} className="h-9 w-32" placeholder="e.g. 20000" />
              {editingGoal && (
                <button type="button" onClick={() => setEditingGoal(false)} className="text-[13px] font-semibold text-cacao">
                  Done
                </button>
              )}
            </label>
          </div>
        )}
        {budget > 0 && (
          <Gauge
            label="Spending"
            pct={(moneyOut / budget) * 100}
            tone={moneyOut > budget ? "bad" : moneyOut > budget * 0.8 ? "warn" : "good"}
            text={
              moneyOut > budget
                ? `${formatPeso(moneyOut - budget)} over your ${formatPeso(budget)} budget`
                : `${Math.round((moneyOut / budget) * 100)}% of your ${formatPeso(budget)} budget used`
            }
          />
        )}
      </div>

      <div className="flex flex-col gap-3 min-[640px]:flex-row">
        <BigButton icon={ArrowUpCircle} label="I sold something" hint="Money coming in" onClick={() => setAdding("SALE")} />
        <BigButton icon={ArrowDownCircle} label="I paid for something" hint="Money going out" onClick={() => setAdding("EXPENSE")} />
      </div>

      {rows.length > 0 && (
        <div>
          <SectionTitle>What happened in {name}</SectionTitle>
          <SentenceList>
            {visible.map((e) => (
              <SentenceRow
                key={e.id}
                onClick={() => setEditing(e)}
                sub={shortDay(e.timestamp)}
                right={<Em tone={e.type === "SALE" ? "good" : "bad"}>{`${e.type === "SALE" ? "+" : "−"}${formatPeso(e.amount)}`}</Em>}
              >
                {entrySentence(e)}
              </SentenceRow>
            ))}
          </SentenceList>
          {rows.length > SHOW_FIRST && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-[13px] font-semibold text-cacao">
              {showAll ? "Show less" : `Show all ${rows.length}`}
            </button>
          )}
        </div>
      )}

      <AdvancedHint what="the full table, budgets by category, or older months" />

      {adding && (
        <QuickEditDialog
          open
          onOpenChange={(o) => !o && setAdding(null)}
          title={adding === "SALE" ? "I sold something" : "I paid for something"}
          initial={blankEntryDraft(adding)}
          lockType
          onSave={(draft) => addEntry(draft)}
        />
      )}
      {editing && (
        <QuickEditDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          title={editing.type === "SALE" ? "Edit this sale" : "Edit this payment"}
          initial={entryToDraft(editing)}
          lockType
          onSave={(draft) => replaceEntry(editing.id, draft)}
          onDelete={() => deleteEntry(editing.id)}
        />
      )}
    </div>
  );
}
