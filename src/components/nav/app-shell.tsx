import type { ReactNode } from "react";
import { SidebarNav } from "@/components/nav/sidebar-nav";
import { BottomTabBar } from "@/components/nav/bottom-tab-bar";
import { LowCreditBanner } from "@/components/chatbot/low-credit-banner";
import { SyncErrorBanner } from "@/components/nav/sync-error-banner";
import { SignInGate } from "@/components/auth/sign-in-gate";

export function AppShell({ children }: { children: ReactNode }) {
  // The gate wraps the navigation too: before anyone says who they are there's nothing on
  // screen to wander into. With no people set up it passes everything straight through.
  return (
    <SignInGate>
    <div className="flex min-h-svh min-w-0 flex-1">
      <SidebarNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <LowCreditBanner />
        <SyncErrorBanner />
        <main className="min-w-0 flex-1 pb-16 min-[900px]:pb-0">{children}</main>
      </div>
      <BottomTabBar />
    </div>
    </SignInGate>
  );
}
