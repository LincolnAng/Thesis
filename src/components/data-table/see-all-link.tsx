"use client";

import { ChevronRight } from "lucide-react";
import { useViewMode } from "@/lib/summary/view-mode";

/** Simple view's escape hatch into the full searchable table and charts —
 * flips the existing global toggle rather than introducing a third view state. */
export function SeeAllLink({ label = "See all" }: { label?: string }) {
  const [, setViewMode] = useViewMode();
  return (
    <button
      type="button"
      onClick={() => setViewMode("advanced")}
      className="flex items-center gap-1 text-sm font-medium text-primary"
    >
      {label} <ChevronRight className="h-4 w-4" />
    </button>
  );
}
