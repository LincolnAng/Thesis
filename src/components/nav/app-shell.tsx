import type { ReactNode } from "react";
import { SidebarNav } from "@/components/nav/sidebar-nav";
import { BottomTabBar } from "@/components/nav/bottom-tab-bar";
import { LowCreditBanner } from "@/components/chatbot/low-credit-banner";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh min-w-0 flex-1">
      <SidebarNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <LowCreditBanner />
        <main className="min-w-0 flex-1 pb-16 min-[900px]:pb-0">{children}</main>
      </div>
      <BottomTabBar />
    </div>
  );
}
