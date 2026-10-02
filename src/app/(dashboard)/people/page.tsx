"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Page, PageTabs } from "@/components/layout/page";
import { CustomersTab } from "@/components/people/customers-tab";
import { SuppliersTab } from "@/components/people/suppliers-tab";
import { EventsTab } from "@/components/people/events-tab";
import { SimplePeople } from "@/components/simple/simple-people";
import { useViewMode } from "@/lib/summary/view-mode";

type Tab = "customers" | "suppliers" | "events";

function PeoplePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [viewMode] = useViewMode();
  // Kept in the URL so a link (or the old /suppliers and /events addresses) opens the right tab.
  const param = searchParams.get("tab");
  const tab: Tab = param === "suppliers" || param === "events" ? param : "customers";

  function selectTab(next: Tab) {
    router.replace(next === "customers" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }

  if (viewMode === "simple") {
    return (
      <Page title="Stakeholders" simpleTitle="Contacts">
        <SimplePeople />
      </Page>
    );
  }

  return (
    <Page title="Stakeholders" simpleTitle="Contacts">
      {/* Said once, at the top: everything on this page is outside the business. The old
          "People" title read as staff, which is the one thing this section isn't. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <PageTabs
          tabs={[
            ["customers", "Customers"],
            ["suppliers", "Suppliers"],
            ["events", "Events"],
          ]}
          value={tab}
          onChange={selectTab}
        />
        <p className="text-[13px] text-muted-foreground">
          Everyone outside the business — who buys from you, who you buy from, and where you sell.
        </p>
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
