import { createSheetCollection } from "./collection";
import type { AiFeature, AiUseRow } from "@/lib/ai/usage-summary";

/**
 * One row per AI request, on the Logs tab: who asked, for what, which model, its tokens and what
 * it cost (lib/ai/spend). The AI costs tab in Settings reads these (lib/ai/usage-summary).
 */
export const aiUsageCollection = createSheetCollection<AiUseRow>({
  sheetName: "Logs",
  section: "AI use",
  header: ["id", "at", "requestId", "userId", "userName", "feature", "model", "inputTokens", "outputTokens", "cacheWriteTokens", "cacheReadTokens", "searches", "costUsd"],
  idColumn: "id",
  toRow: (r) => [
    r.id,
    r.at,
    r.requestId,
    r.userId,
    r.userName,
    r.feature,
    r.model,
    String(r.inputTokens),
    String(r.outputTokens),
    String(r.cacheWriteTokens),
    String(r.cacheReadTokens),
    String(r.searches),
    r.costUsd.toFixed(6),
  ],
  fromRow: ([id, at, requestId, userId, userName, feature, model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, searches, costUsd]) =>
    id && at
      ? {
          id,
          at,
          requestId: requestId || id,
          userId: userId ?? "",
          userName: userName ?? "",
          feature: (feature || "other") as AiFeature,
          model: model ?? "",
          inputTokens: Number(inputTokens) || 0,
          outputTokens: Number(outputTokens) || 0,
          cacheWriteTokens: Number(cacheWriteTokens) || 0,
          cacheReadTokens: Number(cacheReadTokens) || 0,
          searches: Number(searches) || 0,
          costUsd: Number(costUsd) || 0,
        }
      : null,
});
