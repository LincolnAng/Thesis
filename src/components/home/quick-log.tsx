"use client";

import { useMemo, useState } from "react";
import { Box, Receipt, Trash2, TruckIcon, Wallet, type LucideIcon } from "lucide-react";
import { QuickEditDialog } from "@/components/home/quick-edit-dialog";
import { useStore } from "@/lib/store/use-store";
import { addEntry } from "@/lib/store/store";
import { blankEntryDraft } from "@/lib/store/blank-draft";
import { formatPeso, pluralize } from "@/lib/format";
import type { EntryType } from "@/lib/store/types";
import type { EntryDraft } from "@/lib/home/describe-entry";

/**
 * "Log what happened" — the panel under the message box on Home.
 *
 * It replaces three buttons that only pasted an example sentence into the chat. Those
 * helped on day one and then stopped helping: the owner still had to retype every number
 * by hand, and only three of the things that actually happen in a day were covered at all.
 *
 * This covers every kind of entry with a real form, and a sale opens already holding the
 * product that sells most, so the usual case is two taps.
 */

interface Action {
  type: EntryType;
  icon: LucideIcon;
  label: string;
  /** Live figure for today, so the button says something even before it's pressed. */
  today: string;
  tone: "good" | "bad" | "neutral";
}

const TONE_ICON: Record<Action["tone"], string> = {
  good: "bg-success/10 text-success",
  bad: "bg-danger/10 text-danger",
  neutral: "bg-cacao/10 text-cacao",
};

function isToday(iso: string, today: string): boolean {
  return iso.slice(0, 10) === today;
}

export function QuickLog() {
  const { entries, events, products } = useStore();
  const [logging, setLogging] = useState<{ title: string; initial: EntryDraft } | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const todays = useMemo(() => entries.filter((e) => isToday(e.timestamp, today)), [entries, today]);

  const sum = (type: EntryType) =>
    todays.filter((e) => e.type === type).reduce((s, e) => s + (e.amount ?? 0), 0);
  const count = (type: EntryType) => todays.filter((e) => e.type === type).length;
  const hasOpenEvent = events.some((e) => e.status === "open");

  const actions: Action[] = [
    {
      type: "SALE",
      icon: Receipt,
      label: "Sold something",
      today: count("SALE") ? `${formatPeso(sum("SALE"))} today` : "Nothing yet today",
      tone: "good",
    },
    {
      type: "EXPENSE",
      icon: Wallet,
      label: "Paid for something",
      today: count("EXPENSE") ? `${formatPeso(sum("EXPENSE"))} today` : "Nothing yet today",
      tone: "bad",
    },
    {
      type: "INVENTORY_IN",
      icon: Box,
      label: "Made a batch",
      today: count("INVENTORY_IN") ? `${pluralize(count("INVENTORY_IN"), "batch")} today` : "None made today",
      tone: "neutral",
    },
    {
      type: "WASTE",
      icon: Trash2,
      label: "Something spoiled",
      today: count("WASTE") ? `${pluralize(count("WASTE"), "loss")} today` : "Nothing wasted",
      tone: "neutral",
    },
    // Only worth a button when there's somewhere for the stock to go.
    ...(hasOpenEvent
      ? [
          {
            type: "INVENTORY_OUT" as EntryType,
            icon: TruckIcon,
            label: "Stock went out",
            today: count("INVENTORY_OUT") ? `${pluralize(count("INVENTORY_OUT"), "move")} today` : "Took stock somewhere",
            tone: "neutral" as const,
          },
        ]
      : []),
  ];

  /**
   * What you sell most, so a sale opens with the usual product and one of it already in —
   * the amount then works itself out from that product's price. Two taps for the common
   * case, and every field is still there to change.
   */
  const usualProduct = useMemo(() => {
    const sold = new Map<string, number>();
    for (const e of entries) {
      if (e.type !== "SALE" || !e.sku) continue;
      sold.set(e.sku, (sold.get(e.sku) ?? 0) + 1);
    }
    const top = [...sold.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return top ?? products[0]?.name ?? null;
  }, [entries, products]);

  function open(type: EntryType, label: string) {
    const initial = blankEntryDraft(type, "Logged from Home");
    // Only a sale can be guessed at usefully: an expense's item and amount are whatever the
    // receipt says, and guessing a batch's product would put stock somewhere it didn't go.
    if (type === "SALE" && usualProduct) {
      initial.sku = usualProduct;
      initial.quantity = 1;
    }
    setLogging({ title: label, initial });
  }

  return (
    <div className="w-full">
      {/* One row, equal widths, the label under the icon — the running figure moved to the
          tooltip so five of these fit a phone without the text shrinking to nothing. */}
      <div className={`grid w-full gap-2 ${actions.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
        {actions.map((a) => (
          <button
            key={a.type}
            type="button"
            onClick={() => open(a.type, a.label)}
            title={a.today}
            className="flex flex-col items-center justify-start gap-2 rounded-2xl border border-line/15 bg-white px-2 py-3 text-center transition hover:border-cacao/40 hover:shadow-sm"
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE_ICON[a.tone]}`}>
              <a.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <span className="text-[12px] font-semibold leading-tight">{a.label}</span>
          </button>
        ))}
      </div>

      {logging && (
        <QuickEditDialog
          open
          onOpenChange={(o) => !o && setLogging(null)}
          title={logging.title}
          initial={logging.initial}
          lockType
          onSave={(draft) => {
            addEntry(draft);
            setLogging(null);
          }}
        />
      )}
    </div>
  );
}
