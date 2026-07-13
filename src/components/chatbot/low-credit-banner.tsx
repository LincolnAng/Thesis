"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useAiStatus } from "@/lib/ai/use-ai-status";

export function LowCreditBanner() {
  const { degraded, reason } = useAiStatus();

  if (!degraded) return null;

  const message =
    reason === "no_key"
      ? "AI isn't set up yet, so I'll show you a quick form to fill in instead."
      : "AI credits are running low — top up to keep auto-tracking. Using a quick form for now.";

  return (
    <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
      {reason === "no_key" && (
        <Link href="/settings" className="ml-auto shrink-0 underline decoration-dotted">
          Add key →
        </Link>
      )}
    </div>
  );
}
