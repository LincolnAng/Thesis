"use client";

import { useMemo, useState } from "react";
import { PeopleSummary, PeopleTable } from "@/components/people/people-table";
import { EventDetailDialog } from "@/components/events/event-detail-dialog";
import { EventPlanDialog } from "@/components/inventory/event-plan-dialog";
import { useStore } from "@/lib/store/use-store";
import { formatNumber, formatPeso } from "@/lib/format";
import { summarizeEvents } from "@/lib/summary/events";
import type { BusinessEvent } from "@/lib/store/types";

function shortDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
}

type Status = "Upcoming" | "Ongoing" | "Finished";

function statusOf(e: BusinessEvent, today: string): Status {
  if (e.status === "closed") return "Finished";
  if (e.startDate && e.startDate.slice(0, 10) > today) return "Upcoming";
  return "Ongoing";
}

const STATUS_STYLES: Record<Status, string> = {
  Upcoming: "bg-cacao/10 text-cacao",
  Ongoing: "bg-[rgba(198,151,49,0.15)] text-[#8a6a1a]",
  Finished: "bg-success/10 text-success",
};

/** Events and shops that hold some of your stock. Stock sent there leaves main inventory
 * until it sells or comes back. */
export function EventsTab() {
  const { events, eventStock, entries, products } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const summaries = useMemo(() => summarizeEvents(events, eventStock, entries, products), [events, eventStock, entries, products]);
  const order: Record<Status, number> = { Ongoing: 0, Upcoming: 1, Finished: 2 };
  const sorted = [...summaries].sort(
    (a, b) => order[statusOf(a.event, today)] - order[statusOf(b.event, today)] || (a.event.startDate ?? "").localeCompare(b.event.startDate ?? ""),
  );
  const upcoming = sorted.filter((s) => statusOf(s.event, today) === "Upcoming");
  const outThere = summaries.reduce((s, x) => s + x.totalOnHand, 0);
  // Derived live, so the dialog keeps updating as stock moves in and out.
  const selected = summaries.find((s) => s.event.id === selectedId) ?? null;

  return (
    <>
      <PeopleSummary
        items={[
          { label: "Upcoming", value: String(upcoming.length) },
          { label: "Next event", value: upcoming[0] ? `${upcoming[0].event.name} · ${shortDate(upcoming[0].event.startDate)}` : "—" },
          { label: "Stock out there", value: formatNumber(outThere) },
        ]}
        right={
          <button type="button" onClick={() => setAdding(true)} className="rounded-[10px] bg-cacao px-4 py-2.5 text-[13px] font-semibold text-ivory">
            + Add event
          </button>
        }
      />
      <PeopleTable
        columns={[
          { label: "Event", width: "1.6fr" },
          { label: "Dates", width: "1.1fr" },
          { label: "Still there", align: "right" },
          { label: "Sold", align: "right" },
          { label: "Sales", align: "right" },
          { label: "Status", align: "right" },
        ]}
        empty="No events or shops yet — add one when you send stock somewhere else to sell."
        rows={sorted.map((s) => {
          const status = statusOf(s.event, today);
          const start = shortDate(s.event.startDate);
          const end = shortDate(s.event.endDate);
          return {
            key: s.event.id,
            muted: status === "Finished",
            onOpen: () => setSelectedId(s.event.id),
            cells: [
              <span key="n">
                <span className="font-semibold">{s.event.name}</span>
                {s.event.kind === "distributor" && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Shop</span>}
              </span>,
              start ? `${start}${end && end !== start ? ` – ${end}` : ""}` : s.event.kind === "distributor" ? "Ongoing" : "—",
              formatNumber(s.totalOnHand),
              formatNumber(s.totalSold),
              formatPeso(s.revenue),
              <span key="s" className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status]}`}>
                {status}
              </span>,
            ],
          };
        })}
      />
      <div className="mt-3 text-xs text-muted-foreground">
        Click an event to send stock, bring it back, close it, or delete it. Stock there is kept apart from your shelf stock.
      </div>
      {selected && <EventDetailDialog summary={selected} products={products} onClose={() => setSelectedId(null)} />}
      {adding && <EventPlanDialog products={products} onClose={() => setAdding(false)} />}
    </>
  );
}
