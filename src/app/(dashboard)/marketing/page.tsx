"use client";

import { Megaphone } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { BackToSummaryLink } from "@/components/summary/back-to-summary-link";
import { AddSocialStatForm } from "@/components/marketing/add-social-stat-form";
import { PlatformSummaryList } from "@/components/marketing/platform-summary-list";

export default function MarketingPage() {
  return (
    <div>
      <div className="mb-4">
        <BackToSummaryLink />
      </div>
      <PageHeader icon={Megaphone} title="Marketing" />
      <p className="mb-4 text-sm text-muted-foreground">Facebook, TikTok, and Instagram — logged weekly.</p>
      <div className="space-y-4">
        <AddSocialStatForm />
        <PlatformSummaryList />
      </div>
    </div>
  );
}
