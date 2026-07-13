"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useStore } from "@/lib/store/use-store";
import { summarizeByPlatform } from "@/lib/marketing/social-derive";
import { formatNumber } from "@/lib/format";

export function PlatformSummaryList() {
  const { socialStats } = useStore();
  const summaries = summarizeByPlatform(socialStats);

  return (
    <Card>
      <CardContent className="divide-y divide-border px-0 py-0">
        {summaries.map(({ platform, latest, followerChange }) => (
          <div key={platform} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-medium text-foreground">{platform}</p>
              {latest ? (
                <p className="text-xs text-muted-foreground">
                  {formatNumber(latest.followers)} followers · {formatNumber(latest.reach)} reach ·{" "}
                  {formatNumber(latest.engagements)} engagements
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">No entries logged yet.</p>
              )}
            </div>
            {followerChange !== null && (
              <p
                className={
                  followerChange >= 0
                    ? "shrink-0 text-sm font-semibold text-[var(--status-good)]"
                    : "shrink-0 text-sm font-semibold text-[var(--status-warning)]"
                }
              >
                {followerChange >= 0 ? "+" : ""}
                {formatNumber(followerChange)} this week
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
