import { BackToSummaryLink } from "@/components/summary/back-to-summary-link";
import { AddSocialStatForm } from "@/components/marketing/add-social-stat-form";
import { PlatformSummaryList } from "@/components/marketing/platform-summary-list";

export default function MarketingPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-8">
      <div className="mb-4">
        <BackToSummaryLink />
      </div>
      <h1 className="mb-1 text-xl font-bold text-foreground">Marketing</h1>
      <p className="mb-4 text-sm text-muted-foreground">Facebook, TikTok, and Instagram — logged weekly.</p>
      <div className="space-y-4">
        <AddSocialStatForm />
        <PlatformSummaryList />
      </div>
    </div>
  );
}
