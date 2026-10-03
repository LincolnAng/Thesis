"use client";

import { useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { EventDetailDialog } from "@/components/events/event-detail-dialog";
import { EventPlanDialog } from "@/components/inventory/event-plan-dialog";
import { useStore } from "@/lib/store/use-store";
import { deriveCustomers } from "@/lib/summary/customers";
import { averageIngredientCosts } from "@/lib/summary/supplier-costs";
import { summarizeEvents } from "@/lib/summary/events";
import { formatPeso, pluralize } from "@/lib/format";
import { AdvancedHint, BigButton, Em, Headline, SectionTitle, SentenceList, SentenceRow, monthKey, monthKeyOf, shortDay } from "@/components/simple/simple-ui";

/** Unit prices keep their centavos (₱8.40, not ₱8.4). */
function unitPrice(n: number) {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? formatPeso(r) : `₱${r.toFixed(2)}`;
}

/** People in Simple mode: who buys from you, who you buy from, and what's coming up. */
export function SimplePeople() {
  const { entries, suppliers, supplierPrices, rawMaterials, events, eventStock, products } = useStore();
  const [adding, setAdding] = useState(false);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const customers = useMemo(() => deriveCustomers(entries), [entries]);
  const costs = useMemo(() => averageIngredientCosts(supplierPrices, suppliers, rawMaterials), [supplierPrices, suppliers, rawMaterials]);
  const summaries = useMemo(() => summarizeEvents(events, eventStock, entries, products), [events, eventStock, entries, products]);

  const thisMonth = monthKey(0);
  const buyersThisMonth = new Set(
    entries.filter((e) => e.type === "SALE" && e.counterparty && monthKeyOf(e.timestamp) === thisMonth).map((e) => e.counterparty!.toLowerCase()),
  ).size;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const upcoming = summaries
    .filter((s) => s.event.status === "open" && (!s.event.startDate || s.event.startDate.slice(0, 10) >= today))
    .sort((a, b) => (a.event.startDate ?? "9").localeCompare(b.event.startDate ?? "9"));
  const openEvent = summaries.find((s) => s.event.id === openEventId) ?? null;

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6">
      {customers.length === 0 ? (
        <Headline sub="Customers appear here on their own when you record a sale with the buyer's name.">No customers recorded yet.</Headline>
      ) : (
        <Headline
          tone="good"
          sub={customers[0] ? `${customers[0].name} has bought the most from you — ${formatPeso(customers[0].totalSpent)} so far.` : undefined}
        >
          {buyersThisMonth > 0 ? (
            <>
              <Em tone="good">{pluralize(buyersThisMonth, "person", "people")}</Em> bought from you this month.
            </>
          ) : (
            <>No one has bought yet this month — you have {pluralize(customers.length, "customer")} from before.</>
          )}
        </Headline>
      )}

      {customers.length > 0 && (
        <div>
          <SectionTitle>Your best customers</SectionTitle>
          <SentenceList>
            {customers.slice(0, 5).map((c) => (
              <SentenceRow
                key={c.key}
                sub={`Bought ${pluralize(c.orderCount, "time")}${c.lastOrderAt ? ` · last on ${shortDay(c.lastOrderAt)}` : ""}${c.purchases[0]?.sku ? ` · usually ${c.purchases[0].sku}` : ""}`}
                right={formatPeso(c.totalSpent)}
              >
                {c.name}
              </SentenceRow>
            ))}
          </SentenceList>
        </div>
      )}

      {suppliers.length > 0 && (
        <div>
          <SectionTitle>Who you buy from</SectionTitle>
          <SentenceList>
            {suppliers.map((s) => {
              const main = costs.filter((c) => c.supplierId === s.id).sort((a, b) => b.lastLoggedAt.localeCompare(a.lastLoggedAt))[0];
              const change = main ? (main.lastUnitCost - main.avgUnitCost) / Math.max(0.01, main.avgUnitCost) : 0;
              return (
                <SentenceRow
                  key={s.id}
                  sub={
                    main ? (
                      <>
                        {main.materialName}: {unitPrice(main.lastUnitCost)} a {main.unit} last time —{" "}
                        {change > 0.03 ? (
                          <Em tone="bad">more than usual</Em>
                        ) : change < -0.03 ? (
                          <Em tone="good">less than usual</Em>
                        ) : (
                          "about the same as usual"
                        )}
                      </>
                    ) : (
                      s.items || "No prices recorded yet"
                    )
                  }
                >
                  {s.name}
                </SentenceRow>
              );
            })}
          </SentenceList>
        </div>
      )}

      <div>
        <SectionTitle>Coming up</SectionTitle>
        {upcoming.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">No events or shops planned.</p>
        ) : (
          <SentenceList>
            {upcoming.map((s) => {
              const days = s.event.startDate ? Math.ceil((new Date(s.event.startDate).getTime() - now.getTime()) / 86400000) : null;
              return (
                <SentenceRow
                  key={s.event.id}
                  onClick={() => setOpenEventId(s.event.id)}
                  sub={
                    s.totalOnHand > 0
                      ? `${pluralize(s.totalOnHand, "jar")} there now · ${pluralize(s.totalSold, "jar")} sold`
                      : s.event.kind === "distributor"
                        ? "A shop that sells your jars"
                        : "Tap to send jars there"
                  }
                  right={days === null ? undefined : days <= 0 ? "Now" : `in ${pluralize(days, "day")}`}
                >
                  {s.event.name}
                  {s.event.startDate && <span className="text-muted-foreground"> · {shortDay(s.event.startDate)}</span>}
                </SentenceRow>
              );
            })}
          </SentenceList>
        )}
      </div>

      <div className="flex flex-col gap-3 min-[640px]:flex-row">
        <BigButton icon={CalendarPlus} label="Plan an event" hint="A fair, bazaar, or shop that sells your jars" onClick={() => setAdding(true)} />
      </div>

      <AdvancedHint what="full customer and supplier tables, or to log supplier prices" />

      {adding && <EventPlanDialog products={products} onClose={() => setAdding(false)} />}
      {openEvent && <EventDetailDialog summary={openEvent} products={products} onClose={() => setOpenEventId(null)} />}
    </div>
  );
}
