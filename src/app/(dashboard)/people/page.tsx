"use client";

import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Page, PageTabs } from "@/components/layout/page";
import { CustomersTab } from "@/components/people/customers-tab";
import { SuppliersTab } from "@/components/people/suppliers-tab";
import { EventsTab } from "@/components/people/events-tab";
import { PeopleCard } from "@/components/settings/people-card";

type Tab = "customers" | "suppliers" | "events" | "team";

function PeoplePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Suppliers are prices paid — owners' business. Employees see customers and events, in the
  // plain table view (the Simple summary leads with supplier spending).
  const exec = isExecutive(useCurrentUser());
  // Kept in the URL so a link (or the old /suppliers and /events addresses) opens the right tab.
  const param = searchParams.get("tab");
  const tab: Tab = (param === "suppliers" && exec) || param === "events" || param === "team" ? param : "customers";

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
                  ["team", "Team"],
                ]
              : [
                  ["customers", "Customers"],
                  ["events", "Events"],
                  ["team", "Team"],
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
        {/* Who signs in to this app: profiles, PINs and roles. Used to be under Settings. */}
        {tab === "team" && (
          <div className="max-w-4xl">
            <PeopleCard />
          </div>
        )}
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
