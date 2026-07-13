"use client";

import { ChevronLeft } from "lucide-react";

export function BackLink({ onClick, label = "Back to summary" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
