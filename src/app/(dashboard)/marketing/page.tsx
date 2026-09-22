"use client";

import { Page } from "@/components/layout/page";
import { AddSocialStatForm } from "@/components/marketing/add-social-stat-form";
import { PlatformSummaryList } from "@/components/marketing/platform-summary-list";

export default function MarketingPage() {
  return (
    <Page title="Marketing">
      <p className="mb-4 text-sm text-muted-foreground">Facebook, TikTok, and Instagram — logged weekly.</p>
      <div className="max-w-4xl space-y-4">
        <AddSocialStatForm />
        <PlatformSummaryList />
      </div>
    </Page>
  );
}
