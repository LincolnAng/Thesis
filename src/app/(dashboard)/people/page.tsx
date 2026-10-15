"use client";

import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Page, PageTabs } from "@/components/layout/page";
import { CustomersTab } from "@/components/people/customers-tab";
import { SuppliersTab } from "@/components/people/suppliers-tab";
import { EventsTab } from "@/components/people/events-tab";

type Tab = "customers" | "suppliers" | "events";

function PeoplePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Suppliers are prices paid — owners' business. Employees see customers and events, in the
  // plain table view (the Simple summary leads with supplier spending).
  const exec = isExecutive(useCurrentUser());
  // Kept in the URL so a link (or the old /suppliers and /events addresses) opens the right tab.
  const param = searchParams.get("tab");
  const tab: Tab = (param === "suppliers" && exec) || param === "events" ? param : "customers";

  function selectTab(next: Tab) {
    router.replace(next === "customers" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }

  return (
    <Page title="People">
      <div className="mb-6">
        <PageTabs
          tabs={
            exec
              ? [
                  ["customers", "Customers"],
                  ["suppliers", "Suppliers"],
                  ["events", "Events"],
                ]
              : [
                  ["customers", "Customers"],
                  ["events", "Events"],
                ]
          }
          value={tab}
          onChange={selectTab}
        />
      </div>
      <div className="max-w-[1100px]">
        {tab === "customers" && <CustomersTab />}
        {tab === "suppliers" && <SuppliersTab />}
        {tab === "events" && <EventsTab />}
      </div>
    </Page>
  );
}

export default function PeoplePage() {
  return (
    <Suspense fallback={null}>
      <PeoplePageInner />
    </Suspense>
  );
}
