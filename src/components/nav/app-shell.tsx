import type { ReactNode } from "react";
import { TopHeader } from "@/components/nav/top-header";
import { BottomTabBar } from "@/components/nav/bottom-tab-bar";
import { LowCreditBanner } from "@/components/chatbot/low-credit-banner";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh min-w-0 flex-1 flex-col">
      <TopHeader />
      <LowCreditBanner />
      <main className="min-w-0 flex-1 pb-16 min-[900px]:pb-0">{children}</main>
      <BottomTabBar />
    </div>
  );
}
