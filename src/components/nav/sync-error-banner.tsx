"use client";

import { AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store/use-store";

/** Shown when the most recent write to Google Sheets failed. This is
 * visibility only, not automatic retry — the failed write itself is not
 * resent, so the underlying edit may need to be redone once the connection
 * is back. Clears as soon as any later write to Sheets succeeds. */
export function SyncErrorBanner() {
  const { syncStatus } = useStore();

  if (!syncStatus.failing) return null;

  return (
    <div className="flex items-center gap-2 border-b border-red-300 bg-red-50 px-4 py-2 text-xs font-medium text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>Couldn&apos;t save your last change to Google Sheets — check your connection and try that edit again.</span>
    </div>
  );
}
