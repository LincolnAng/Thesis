"use client";

import { Page } from "@/components/layout/page";
import { HomeChat } from "@/components/home/home-chat";
import { TodayTasks } from "@/components/reminders/reminders";

/**
 * Home is two things: BAi, to ask or log anything, and Today at a glance — the day's tasks for
 * whoever is signed in, drawn from every tab and their own calendar. Nothing else: figures and
 * charts live on the tabs they belong to.
 */
export default function HomePage() {
  return (
    <Page title="Home">
      {/* BAi on the left, today's tasks on the right; on a phone, the tasks come first. */}
      <div className="grid gap-6 pb-4 min-[1280px]:grid-cols-[minmax(0,1fr)_400px] min-[1280px]:items-start">
        <div className="order-2 min-w-0 min-[1280px]:order-1">
          <HomeChat />
        </div>
        <aside className="order-1 min-[1280px]:sticky min-[1280px]:top-[96px] min-[1280px]:order-2">
          <TodayTasks />
        </aside>
      </div>
    </Page>
  );
}
