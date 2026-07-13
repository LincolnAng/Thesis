"use client";

import { useStore } from "@/lib/store/use-store";

export const LOW_CREDIT_RATIO = 0.8;

export type AiDegradeReason = "no_key" | "low_credits" | null;

export function useAiStatus(): { degraded: boolean; reason: AiDegradeReason; usedRatio: number } {
  const { tokenUsage, aiStatus } = useStore();
  const usedRatio =
    tokenUsage.estimatedBudgetTokens > 0
      ? (tokenUsage.totalInputTokens + tokenUsage.totalOutputTokens) / tokenUsage.estimatedBudgetTokens
      : 0;

  if (aiStatus.apiKeyMissing) {
    return { degraded: true, reason: "no_key", usedRatio };
  }
  if (usedRatio >= LOW_CREDIT_RATIO) {
    return { degraded: true, reason: "low_credits", usedRatio };
  }
  return { degraded: false, reason: null, usedRatio };
}
