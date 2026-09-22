"use client";

import { useMemo, useState } from "react";
import { PeopleSummary, PeopleTable } from "@/components/people/people-table";
import { useStore } from "@/lib/store/use-store";
import { formatNumber, formatPeso } from "@/lib/format";
import { customerKey, deriveCustomers, entriesForCustomer } from "@/lib/summary/customers";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Customers are built from every sale logged; names match ignoring case and extra spaces. */
export function CustomersTab() {
  const { entries } = useStore();
  const [search, setSearch] = useState("");
  const customers = useMemo(() => deriveCustomers(entries), [entries]);
  const filtered = useMemo(() => {
    const q = customerKey(search);
    return q ? customers.filter((c) => c.key.includes(q)) : customers;
  }, [customers, search]);

  const totalSpent = customers.reduce((sum, c) => sum + c.totalSpent, 0);
  const totalOrders = customers.reduce((sum, c) => sum + c.orderCount, 0);

  return (
    <>
      <PeopleSummary
        items={[
          { label: "Customers", value: String(customers.length) },
          { label: "Average purchase", value: formatPeso(totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0) },
          { label: "Top customer", value: customers[0]?.name ?? "—" },
        ]}
        right={
          <input
            type="text"
            placeholder="Search customers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[200px] rounded-lg border border-line/20 bg-white px-3 py-2 text-[13px] outline-none focus:border-cacao"
          />
        }
      />
      <PeopleTable
        columns={[
          { label: "Customer", width: "1.6fr" },
          { label: "Usually buys", width: "1.2fr" },
          { label: "Orders", align: "right" },
          { label: "Avg order", align: "right" },
          { label: "Total spent", align: "right" },
          { label: "Last order", align: "right" },
        ]}
        empty="No customers yet — they appear as soon as you log a sale with a buyer name."
        rows={filtered.map((c) => ({
          key: c.key,
          cells: [
            <span key="n" className="font-semibold">
              {c.name}
            </span>,
            <span key="b" className="text-muted-foreground">
              {c.purchases[0]?.sku ?? "—"}
            </span>,
            formatNumber(c.orderCount),
            formatPeso(Math.round(c.avgOrderValue)),
            <span key="t" className="font-semibold">
              {formatPeso(c.totalSpent)}
            </span>,
            c.lastOrderAt ? shortDate(c.lastOrderAt) : "—",
          ],
          detail: (
            <div className="flex flex-col gap-1.5 py-2 text-[12px]">
              {c.spellings.length > 1 && (
                <div className="text-muted-foreground">Also spelled {c.spellings.filter((s) => s !== c.name).join(", ")}</div>
              )}
              {entriesForCustomer(c.key, entries).map((e) => (
                <div key={e.id} className="grid grid-cols-[100px_1fr_auto] gap-3">
                  <span className="text-muted-foreground">{shortDate(e.timestamp)}</span>
                  <span>
                    {e.sku ?? e.rawText}
                    {e.quantity != null && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {formatNumber(e.quantity)}
                        {e.unit ? ` ${e.unit}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold">{formatPeso(e.amount)}</span>
                </div>
              ))}
            </div>
          ),
        }))}
      />
    </>
  );
}
