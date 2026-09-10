"use client";

import type { ReactNode } from "react";
import { useViewMode } from "@/lib/summary/view-mode";

/**
 * The Simple/Advanced width split, enforced here rather than page by page.
 *
 * At 680px a page physically cannot lay out a wide table or a side-by-side chart pair, so
 * the difference between the two modes lives in the layout rather than in the discipline of
 * whoever writes the next page.
 */
export function PageShell({ children }: { children: ReactNode }) {
  const [mode] = useViewMode();
  const maxWidth = mode === "simple" ? "var(--content-simple)" : "var(--content-advanced)";

  return (
    <div className="mx-auto w-full px-4 py-6 min-[1024px]:px-10" style={{ maxWidth }}>
      {children}
    </div>
  );
}
