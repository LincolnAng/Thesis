import type { ReactNode } from "react";
import { ViewModeToggle } from "@/components/summary/view-mode-toggle";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="border-b border-border px-4 py-3">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-end">
          <ViewModeToggle />
        </div>
      </div>
      {children}
    </div>
  );
}
