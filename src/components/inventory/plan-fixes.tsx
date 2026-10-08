"use client";

import { AlertTriangle, ArrowRight, Clock } from "lucide-react";
import type { PlanFix } from "@/lib/summary/plan-contingency";

/**
 * What to change when the plan can't be met.
 *
 * The schedule used to say "2 batches won't be ready in time" and stop. That names a problem
 * and hands back no way out, which for someone who did not build the calendar is a dead end.
 * Each row here is a problem and the single thing to change, with the day or the amount in it.
 */

const TONE: Record<PlanFix["severity"], { ring: string; chip: string; label: string }> = {
  blocked: { ring: "border-danger/30 bg-danger/[0.04]", chip: "bg-danger/10 text-danger", label: "Can't be done" },
  late: { ring: "border-[#9A6B12]/30 bg-[#9A6B12]/[0.05]", chip: "bg-[#9A6B12]/10 text-[#9A6B12]", label: "Too late" },
  warning: { ring: "border-line/20 bg-secondary/40", chip: "bg-secondary text-muted-foreground", label: "Worth checking" },
};

export function PlanFixes({ fixes, compact = false }: { fixes: PlanFix[]; compact?: boolean }) {
  if (fixes.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {fixes.map((f) => {
        const tone = TONE[f.severity];
        const Icon = f.severity === "late" ? Clock : AlertTriangle;
        return (
          <div key={f.id} className={`rounded-2xl border px-4 py-3 ${tone.ring}`}>
            <div className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.chip}`}>
                    {tone.label}
                  </span>
                  {!compact && <span className="text-[13px] font-semibold">{f.problem}</span>}
                </div>
                {compact && <p className="mt-1 text-[13px] font-semibold">{f.problem}</p>}
                <p className="mt-1 flex items-start gap-1.5 text-[13px] text-muted-foreground">
                  <ArrowRight className="mt-[3px] h-3.5 w-3.5 shrink-0" />
                  <span>{f.fix}</span>
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
