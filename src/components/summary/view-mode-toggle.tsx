"use client";

import { Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useViewMode } from "@/lib/summary/view-mode";

export function ViewModeToggle() {
  const [mode, setMode] = useViewMode();
  const advanced = mode === "advanced";

  return (
    <label className="flex items-center gap-2.5 text-sm font-medium text-foreground">
      <span className="flex items-center gap-1.5">
        {advanced && <Sparkles className="h-3.5 w-3.5 text-primary" />}
        {advanced ? "Advanced view" : "Simple view"}
      </span>
      <Switch checked={advanced} onCheckedChange={(checked) => setMode(checked ? "advanced" : "simple")} />
    </label>
  );
}
